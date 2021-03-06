salty
=====

Alternative public key encryption

## Description

Salty is an alternative to PGP/GPG using [NaCl](https://en.wikipedia.org/wiki/NaCl_(software)) instead of RSA/DSA.

Commits and tags in this repo are signed with GPG key [5FBB 2F98 3862 1AFF](https://keybase.io/carlos8f).

### Features

- supports anonymous-sender or signed/verified messaging
- sharable pubkey string that can fit in a single tweet
- fast, streaming encryption over large (multi-GB) files
- public signing/verifying with detached signatures
- binary or "ascii armor" PEM output
- AES-256 protected PEM format for wallets
- comparable to `gpg` in performance
- MIT-licensed

## Install (Mac OSX)

```
$ brew tap carlos8f/tap
$ brew install salty
```

## Other UNIX-based platforms:

Install first: [nodejs](https://nodejs.org/)

```
$ git clone https://github.com/carlos8f/salty.git
$ sudo ln -s `pwd`/salty/salty /usr/local/bin/salty
```

## Format

Byte counts are in `()` parenthesis.

### Salty wallet

Designed to allow both decryption and signing.

```
  decryption      signing
-------------- + -----------
decryptSk (32)   signSk (64)
```

Example (wallets are stored as encrypted PEM on disk)

```
-----BEGIN SALTY WALLET-----
Proc-Type: 4,ENCRYPTED
DEK-Info: AES-256-CBC,0CFAE3D8E9C0126399949B42F1F0660A

iHJYVUldHlQhBRAIys+Zf/kSymKFoc1KT5dH6izm1nXcUI97eH93i4+Lx5dzj+Sd
QN3J5NwusWjGyMk4O/FiBVygxF+z6tOmu2A/mGEXZlgw91GmRwM+YlEd5vabxg5I
mlgYjrqP4ffJ8/I09e2RGg==
-----END SALTY WALLET-----
```

### Salty pubkey

Designed to be sharable, human-readable, and unique.

```
   type                          public keys                            optional meta
---------- [space] ----------------------------------------- [space] --------  ---------
"salty-id"         base64url(encryptPk (32) + verifyPk (32))         "{name}"  <{email}>

```

Example:

```
salty-id oU3lbcpdHo81Eo8SifwoHg5CEEZ5q-Rb0_zMWpJU-GWlr9lIjILqv5RneVsMo3azdEJ8UYTmz86dz0Cx5ciIsw "Carlos Rodriguez" <carlos@s8f.org>
```

### Salty file

Designed to allow anonymous or signed messages, and verify message integrity.

```
required meta    ciphertext  
-------------- + ----------
ephemeral (80)    plaintext
```

### Ephemeral

Designed to hide the message and header inside an anonymously encrypted/authenticated payload.

```
    random         random      message length (encrypted, 24 bytes)
-------------- + ---------- + ---------------------------------------
encryptPk (32)   nonce (24)       totalSize (8 bytes, big endian)
```

### Plaintext

Appends a header to the message for verification, and pads the plaintext with random bytes.

```
--------- + ------- + -------------------
 message     header     random bytes (?)
```

### Header

Always contains a sha256 HMAC to authenticate the message, and optionally contains a signature from the sender.

```
hash: base64( sha256_hmac( shared_secret ) of plaintext )
[from-salty-id]: base64(encryptPk (32) + verifyPk (32))
[to-salty-id]: base64(encryptPk (32) + verifyPk (32))
[signature]: base64( detached sig of previous headers )
```

Example:

```
hash:          dH4McUU9sLJV+i34hfXjSUGTYn2xQhj2gbAYqAMighU=
from-salty-id: oU3lbcpdHo81Eo8SifwoHg5CEEZ5q-Rb0_zMWpJU-GWlr9lIjILqv5RneVsMo3azdEJ8UYTmz86dz0Cx5ciIsw
to-salty-id:   oU3lbcpdHo81Eo8SifwoHg5CEEZ5q-Rb0_zMWpJU-GWlr9lIjILqv5RneVsMo3azdEJ8UYTmz86dz0Cx5ciIsw
signature:     vtQQktMrFEszVSeVMgqN22EPOCMjZQZvA2TZkujcE7BtXAv9Lf7k1P4HE1D/c/XoIPvoQ8LiHJEgumWlgGuNDg==
```

## Usage

```
  Usage: salty [command]

  Commands:

    init                                    initialize a wallet at ~/.salty
    id|pubkey                               output your shareable pubkey string
    import|i <pubkey|url|file>              import a pubkey
    ls|l                                    list imported keys
    encrypt|e [options] [infile] [outfile]  encrypt a file
    decrypt|d [options] <infile> [outfile]  decrypt and verify a file
    sign|s [options] <infile> [outfile]     create a ".salty-sig" signature file
    verify|v <insig> [infile]               verify a ".salty-sig" signature with the original file
    save [indir] [outfile]                  save an encrypted backup of your wallet
    restore [infile] [outdir]               restore your wallet from a backup

  Options:

    -h, --help     output usage information
    -V, --version  output the version number
```

- - -

### License: MIT

- Copyright (C) 2016 Carlos Rodriguez (http://s8f.org/)
- Copyright (C) 2016 Terra Eclipse, Inc. (http://www.terraeclipse.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the &quot;Software&quot;), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.