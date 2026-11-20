// Reads an amethyst wallet file of desktop walletd 3.x (SQLite, src/Core/WalletHDsqlite.cpp) for the import in
// the browser. Built into desktop-import.wasm by emcc_import.sh; the page loads it only when such a file is picked.
//
// File layout (walletd 3.5.1):
//   unencrypted(key, value): 'salt' = 32 random bytes; 'is_hardware' present for Ledger/Trezor wallets
//   parameters(key_hash, key, value): every value encrypted
//   wallet key  = cn_slow_hash(salt | password)                      (CryptoNight v0, as chacha8 key derivation)
//   key_hash    = cn_fast_hash(wallet key | "db_parameters" | name)  (keccak-256)
//   value       = iv[32] | chacha20(key = cn_fast_hash(wallet key | iv), nonce 0)(size le32 | data | padding)
//   names: version = "CryptoNoteWallet1", coinname, mnemonic, mnemonic-password,
//          total_address_count (varint), creation_timestamp (varint; mainnet name has no suffix)
// Returns JSON: {"mnemonic","mnemonic_password","creation_timestamp","address_count"} or {"error":"code"}.
#include <sqlite3.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

#include "crypto/bernstein/chacha8.h"
#include "crypto/hash.h"

static uint8_t wallet_key[32];

static void zero(void *p, size_t n) {
	volatile uint8_t *v = (volatile uint8_t *)p;
	while (n--) *v++ = 0;
}

// Decrypts parameter `name` into a malloc'd buffer (*out, *out_size). Returns 1 if found and valid.
static int get_param(sqlite3 *db, const char *name, uint8_t **out, size_t *out_size) {
	size_t nlen = strlen(name), plen = strlen("db_parameters");
	uint8_t *kd = malloc(32 + plen + nlen);
	memcpy(kd, wallet_key, 32);
	memcpy(kd + 32, "db_parameters", plen);
	memcpy(kd + 32 + plen, name, nlen);
	struct cryptoHash key_hash;
	crypto_cn_fast_hash(kd, 32 + plen + nlen, &key_hash);
	zero(kd, 32);
	free(kd);

	sqlite3_stmt *st = NULL;
	int found = 0;
	if (sqlite3_prepare_v2(db, "SELECT value FROM parameters WHERE key_hash = ?", -1, &st, NULL) != SQLITE_OK)
		return 0;
	sqlite3_bind_blob(st, 1, key_hash.data, 32, SQLITE_STATIC);
	if (sqlite3_step(st) == SQLITE_ROW) {
		const uint8_t *v = sqlite3_column_blob(st, 0);
		size_t n = (size_t)sqlite3_column_bytes(st, 0);
		if (v && n >= 32 + 4) {
			uint8_t kiv[64];
			memcpy(kiv, wallet_key, 32);
			memcpy(kiv + 32, v, 32);
			struct cryptoHash k;
			crypto_cn_fast_hash(kiv, 64, &k);
			zero(kiv, sizeof kiv);
			uint8_t nonce[CHACHA8_IV_SIZE] = {0};
			size_t m = n - 32;
			uint8_t *plain = malloc(m);
			chacha(20, v + 32, m, k.data, nonce, (char *)plain);
			zero(&k, sizeof k);
			uint32_t real = plain[0] | plain[1] << 8 | (uint32_t)plain[2] << 16 | (uint32_t)plain[3] << 24;
			if (real <= m - 4) {
				*out = malloc(real + 1);
				memcpy(*out, plain + 4, real);
				(*out)[real] = 0;
				*out_size = real;
				found = 1;
			}
			zero(plain, m);
			free(plain);
		}
	}
	sqlite3_finalize(st);
	return found;
}

static int get_varint(sqlite3 *db, const char *name, uint64_t *value) {
	uint8_t *b = NULL;
	size_t n = 0;
	if (!get_param(db, name, &b, &n)) return 0;
	uint64_t v = 0;
	int ok = 0;
	for (size_t i = 0, shift = 0; i < n && shift < 64; i++, shift += 7) {
		v |= (uint64_t)(b[i] & 0x7f) << shift;
		if (!(b[i] & 0x80)) { ok = (i + 1 == n); break; }
	}
	free(b);
	if (ok) *value = v;
	return ok;
}

static int get_string(sqlite3 *db, const char *name, char **value) {
	uint8_t *b = NULL;
	size_t n = 0;
	if (!get_param(db, name, &b, &n)) return 0;
	*value = (char *)b;
	return 1;
}

// JSON string literal for s (UTF-8 passed through, control characters escaped)
static size_t json_str(char *dst, const char *s) {
	size_t k = 0;
	dst[k++] = '"';
	for (; *s; s++) {
		unsigned char c = (unsigned char)*s;
		if (c == '"' || c == '\\') { dst[k++] = '\\'; dst[k++] = c; }
		else if (c < 0x20) k += sprintf(dst + k, "\\u%04x", c);
		else dst[k++] = c;
	}
	dst[k++] = '"';
	dst[k] = 0;
	return k;
}

static char *error(const char *code) {
	char *r = malloc(strlen(code) + 16);
	sprintf(r, "{\"error\":\"%s\"}", code);
	return r;
}

// file: the whole .wallet file; password: UTF-8. The result is malloc'd: free it with _free.
EMSCRIPTEN_KEEPALIVE char *desktop_import(const uint8_t *file, size_t size, const char *password) {
	static const char MAGIC[16] = "SQLite format 3";
	if (size < 512 || memcmp(file, MAGIC, 16) != 0) return error("not_sqlite");

	sqlite3 *db = NULL;
	if (sqlite3_open(":memory:", &db) != SQLITE_OK) { sqlite3_close(db); return error("sqlite"); }
	uint8_t *copy = sqlite3_malloc64(size);
	memcpy(copy, file, size);
	if (sqlite3_deserialize(db, "main", copy, size, size,
	        SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_READONLY) != SQLITE_OK) {
		sqlite3_close(db);
		return error("sqlite");
	}

	char *result = NULL, *version = NULL, *coin = NULL, *mnemonic = NULL, *mpass = NULL;
	sqlite3_stmt *st = NULL;
	const uint8_t *salt = NULL;
	size_t salt_size = 0;
	int hardware = 0;
	if (sqlite3_prepare_v2(db, "SELECT key, value FROM unencrypted", -1, &st, NULL) != SQLITE_OK) {
		result = error("not_wallet");
		goto done;
	}
	uint8_t salt_buf[256];
	while (sqlite3_step(st) == SQLITE_ROW) {
		const char *k = (const char *)sqlite3_column_text(st, 0);
		if (!k) continue;
		if (strcmp(k, "is_hardware") == 0) hardware = 1;
		if (strcmp(k, "salt") == 0 && sqlite3_column_bytes(st, 1) <= (int)sizeof salt_buf) {
			salt_size = (size_t)sqlite3_column_bytes(st, 1);
			memcpy(salt_buf, sqlite3_column_blob(st, 1), salt_size);
			salt = salt_buf;
		}
	}
	sqlite3_finalize(st);
	if (hardware) { result = error("hardware"); goto done; }
	if (!salt) { result = error("not_wallet"); goto done; }

	{
		size_t plen = strlen(password);
		uint8_t *sp = malloc(salt_size + plen);
		memcpy(sp, salt, salt_size);
		memcpy(sp + salt_size, password, plen);
		void *scratch = malloc(SLOW_HASH_CONTEXT_SIZE);
		struct cryptoHash h;
		crypto_cn_slow_hash(scratch, sp, salt_size + plen, &h);
		memcpy(wallet_key, h.data, 32);
		zero(&h, sizeof h);
		zero(sp, salt_size + plen);
		free(sp);
		free(scratch);
	}

	if (!get_string(db, "version", &version)) { result = error("wrong_password"); goto done; }
	if (strcmp(version, "CryptoNoteWallet1") != 0) { result = error("unknown_version"); goto done; }
	if (!get_string(db, "coinname", &coin) || strcmp(coin, "bytecoin") != 0) { result = error("other_coin"); goto done; }
	if (!get_string(db, "mnemonic", &mnemonic)) { result = error("view_only"); goto done; }
	if (!get_string(db, "mnemonic-password", &mpass)) { result = error("damaged"); goto done; }
	uint64_t count = 1, created = 0;
	get_varint(db, "total_address_count", &count);
	get_varint(db, "creation_timestamp", &created);

	result = malloc(2 * 6 * (strlen(mnemonic) + strlen(mpass)) + 200);
	size_t k = (size_t)sprintf(result, "{\"mnemonic\":");
	k += json_str(result + k, mnemonic);
	k += (size_t)sprintf(result + k, ",\"mnemonic_password\":");
	k += json_str(result + k, mpass);
	sprintf(result + k, ",\"creation_timestamp\":%llu,\"address_count\":%llu}",
	    (unsigned long long)created, (unsigned long long)count);

done:
	zero(wallet_key, sizeof wallet_key);
	if (mnemonic) { zero(mnemonic, strlen(mnemonic)); free(mnemonic); }
	if (mpass) { zero(mpass, strlen(mpass)); free(mpass); }
	free(version);
	free(coin);
	sqlite3_close(db);
	return result;
}
