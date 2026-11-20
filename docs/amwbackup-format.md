# `.amwbackup` file format, version 2

An encrypted backup of a Bytecoin *amethyst* (BIP39, 24-word) wallet. Version 2 adds a **snapshot**: the state of a synced wallet at a known block. The wallet that restores the file then scans only the blocks after that block, not the whole chain since the wallet was created.

The format comes from Amethyst Web Wallet. The following programs should write it:

| Writer | How it gets the data |
| --- | --- |
| Amethyst Web Wallet (browser, iPhone/Android installed app) | its own walletd in WebAssembly |
| BCN Wallet for Windows (`bcn-wallet-gui`) | the walletd 3.5.1 it runs, over JSON-RPC |

Any program that runs walletd 3.x can write this file the same way, because all the data comes from standard walletd JSON-RPC methods.

## 1. Container (the same in versions 1 and 2)

```
offset  size  content
0       10    magic, ASCII "AMWBACKUP1"
10      16    salt, random
26      12    nonce (IV), random
38      n     AES-256-GCM ciphertext of the payload (UTF-8 JSON)
38+n    16    GCM tag
```

- **Key:** PBKDF2-HMAC-SHA256 of the password (UTF-8, not normalised), with the salt and 600,000 iterations, giving 32 bytes.
- **Cipher:** AES-256-GCM with the 12-byte nonce. The associated data (AAD) is the first 38 bytes of the file (magic, salt and nonce). The 16-byte tag is appended after the ciphertext, which is the layout Web Crypto produces.
- **Password:** at least 10 characters. Writers must enforce this; readers accept any password.
- **Wrong password or damaged file:** the tag check fails. Show one message for both cases.
- **Salt and nonce:** fresh random values for every file, from a CSPRNG. Never reuse a salt/nonce pair.
- **File name:** suggested `bcn-<first 8 characters of the address after "bcnZ">-<YYYY-MM-DD>.amwbackup`. Readers must not depend on the name or the extension, because iOS may rename the file when it is shared.

### Test vector

Checked with both Web Crypto and Python `hashlib` + `cryptography`.

```
password  test-password-123
salt      000102030405060708090a0b0c0d0e0f
nonce     101112131415161718191a1b
payload   {"format":"amethyst-web-wallet-backup","version":2}
key       7aa064f8ed55667e6b4f955451cc33ba6da33afb761a021da014ff524deddf14
file      414d574241434b555031000102030405060708090a0b0c0d0e0f101112131415161718191a1b
          69ecc384c0d1def323c7496dd3cd8024ab9c45df55747822ed24b5143f0f815bd714c993982296d043
          d969ced04fc73e38c3d770301a25cf0e2c1329378214271d8f47
sha256    fc7e950e7c7820d8d23a887ba23a2439008f748e2c5ddf6b135fdd9b4d5c0ac5
```

## 2. Payload

UTF-8 JSON, one object, no BOM.

```json
{
  "format": "amethyst-web-wallet-backup",
  "version": 2,
  "created_by": "BCN Wallet 1.1.0 (Windows)",
  "saved_at": 1795180000,
  "net": "main",
  "wallet": {
    "type": "amethyst",
    "mnemonic": "word1 word2 … word24",
    "mnemonic_password": "",
    "address_count": 3,
    "first_address": "bcnZ…",
    "creation_timestamp": 1794873600
  },
  "snapshot": {
    "height": 3665046,
    "block_hash": "7153d47526f658451cd009697b8ada77a2ab87ac7f4566d808477e3d3bf658e3",
    "block_timestamp": 1795178855,
    "first_activity_height": 3641210,
    "first_activity_timestamp": 1794880412,
    "balance": { "spendable": 1500000000, "spendable_dust": 0, "locked_or_unconfirmed": 0,
                 "spendable_outputs": 4, "spendable_dust_outputs": 0, "locked_or_unconfirmed_outputs": 0 },
    "unspents": [ { "amount": 1000000000, "public_key": "…", "stack_index": 0, "global_index": 123456,
                    "height": 3641210, "unlock_block_or_timestamp": 0, "index_in_transaction": 1,
                    "transaction_hash": "…", "key_image": "…", "address": "bcnZ…", "dust": false } ],
    "history_from_height": 0,
    "blocks": [ { "header": { "height": 3641210, "hash": "…", "timestamp": 1794880412, "…": "…" },
                  "transactions": [ { "hash": "…", "fee": 1000000, "transfers": [ … ], "…": "…" } ],
                  "unlocked_transfers": [ ] } ]
  }
}
```

### Rules

**`version`** is 2. Readers must also accept version 1, which has the same fields as the `wallet` object at the top level (`mnemonic`, `creation_timestamp`, `address_count`, `first_address`, `saved_at`) and has no snapshot.

**`net`** is `"main"`; walletd reports it in `get_wallet_info.net`. Readers refuse a file for another network.

**`wallet`** comes from `get_wallet_info` with `need_secrets: true`:

| Field | Source and rule |
| --- | --- |
| `type` | `wallet_type` |
| `mnemonic` | `mnemonic` |
| `mnemonic_password` | the BIP39 passphrase if the wallet has one, otherwise `""`. walletd's RPC does not return it: a writer that cannot know it must refuse wallets that have one, not write `""` |
| `address_count` | `total_address_count` |
| `first_address` | `first_address` |
| `creation_timestamp` | `wallet_creation_timestamp`; may be 0 (a wallet restored from its phrase in desktop walletd never records one) |

- Only `type: "amethyst"` is allowed.
- Legacy wallets (address `2…`), view-only wallets and hardware (Ledger/Trezor) wallets have no phrase, so writers must refuse them.

**`snapshot`** is optional. Writers include it only when walletd is fully synced (`get_status`: `top_block_height == top_known_block_height`, and the latter is greater than 0).

- **`height`** = `top_block_height − 10`, chosen once and then used, as an absolute height, in every call below. Ten confirmations make it very unlikely that the snapshot block is replaced by a chain reorganisation. walletd answers `get_balance` / `get_unspents` only for the last 128 blocks, so 10 is well inside that limit.
- **`block_hash`, `block_timestamp`:** from `get_block_header` with `{"height_or_depth": height}`, asked of the bytecoind that walletd syncs from (the remote node, or the local node in full mode). Use `block_header.hash` and `block_header.timestamp`.
- **`balance`:** `get_balance` with `{"height_or_depth": height}`, copied as is.
- **`unspents`:** `get_unspents` with `{"height_or_depth": height}`; the concatenation of `spendable` and `locked_or_unconfirmed`, objects copied as is.
  - Writers must check that the sum of `amount` over `unspents` equals `spendable + spendable_dust + locked_or_unconfirmed`, and that the number of outputs equals the sum of the three `*_outputs` counts. If either check fails, write no snapshot.
  - Each output must have a non-zero `key_image`. A wallet with spend keys (amethyst) has one; without it, a spend could not be detected.
- **`first_activity_height` / `first_activity_timestamp`:** the height and timestamp of the first block in which the wallet has a transfer. Get it from `get_transfers` with `{"from_height": 0, "to_height": height, "forward": true, "desired_transaction_count": 1}`, reading `blocks[0].header`. Both are 0 if the wallet had no transfers up to `height`.
- **`blocks`:** history, `get_transfers` with `{"from_height": history_from_height, "to_height": height, "forward": true, "need_outputs": true}`, the `blocks` array copied as is. This is display data: balance and spending use `unspents`.
  - Call it in pages (`desired_transaction_count` 1000, then continue with `next_from_height`).
  - If the payload would exceed 16 MB, drop the oldest blocks and set **`history_from_height`** to the height before the first block kept. Otherwise it is 0, meaning the history is complete.

**Numbers:**
- Amounts are JSON integers in atomic units (1 BCN = 10^8), exactly as walletd writes them. They can exceed 2^53, so readers must parse them as 64-bit integers. The web wallet hands the snapshot to walletd (C++) for this reason and does not parse it in JavaScript.
- Hashes and keys are lower-case hex strings.
- Timestamps are Unix seconds (UTC).

**Unknown fields** must be ignored by readers. A writer may add fields; it must not change the meaning of these ones without changing `version`.

## 3. Restoring (reader behaviour)

1. Decrypt and parse; check `format`, `version` (1 or 2), `net` and `wallet.type`; validate the phrase checksum.
2. Choose where scanning starts. One day is subtracted from every timestamp (time zones, clock skew).

   | Situation | Scanning starts from |
   | --- | --- |
   | Snapshot present and the wallet can load it (step 3) | block `snapshot.height + 1` |
   | Snapshot present, not loaded, `first_activity_timestamp` > 0 | `first_activity_timestamp` |
   | Snapshot present, not loaded, `first_activity_timestamp` = 0 | `snapshot.block_timestamp`; the wallet had nothing before it |
   | No snapshot | `creation_timestamp`; if that is 0, the whole chain |

   The rows without loading are always correct, because walletd finds every output after that time. Loading the snapshot only makes it faster.
   Amethyst Web Wallet (from sw v18) implements step 2 without loading: it reads versions 1 and 2 and uses the rows "not loaded". It also writes version 2 with a snapshot when the wallet is synced, and without one otherwise.
3. Loading the snapshot (planned for the web wallet as walletd extension `ext_import_snapshot`):
   - Check with the node that the block at `snapshot.height` still has `snapshot.block_hash`. If it does not, use the fallback rows of the table above.
   - Set the wallet's sync tip to that block and add `unspents` (with their key images) to the wallet state.
   - Scanning then continues from `height + 1`. Spends of snapshot outputs after the snapshot are found by their key images, as usual.
4. Show `blocks` as the history before the snapshot. Transactions after it come from scanning.
5. After the first sync, compare the balance with the snapshot balance minus later spends; this is the normal walletd balance and needs no extra step.

## 4. Security notes

- The file holds the recovery phrase, so it is as sensitive as the phrase itself. The snapshot adds privacy-relevant data (history, balances) but no extra secrets.
- PBKDF2 with 600,000 iterations slows guessing, but a short password can still be found. Writers should recommend a long passphrase.
- Writers must not log the payload, must clear the plaintext from memory when they can, and should not leave unencrypted temporary files.
