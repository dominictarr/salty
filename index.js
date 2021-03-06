var nacl = require('tweetnacl')
  , through = require('through')
  , pemtools = require('pemtools')
  , assert = require('assert')
  , base64url = require('base64-url')
  , prompt = require('cli-prompt')
  , fs = require('fs')
  , path = require('path')
  , crypto = require('crypto')

nacl.stream = require('nacl-stream').stream

var a = function (buf) {
  return new Uint8Array(buf)
}

var salty = module.exports = {
  nacl: nacl,
  nonce: function (len) {
    return Buffer(nacl.randomBytes(len || nacl.box.nonceLength))
  },
  MAX_CHUNK: 65535 * 10,
  EPH_LENGTH: 80
}

salty.parsePubkey = function (input) {
  var buf
  try {
    if (Buffer.isBuffer(input)) {
      buf = input
    }
    else {
      var match = input.match(/(?:salty\-id)?\s*([a-zA-Z0-9-\_]+)\s*(?:"([^"]*)")?\s*(?:<([^>]*)>)?/)
      assert(match)
      buf = Buffer(base64url.unescape(match[1]), 'base64')
    }
    assert.equal(buf.length, 64)
  }
  catch (e) {
    throw new Error('invalid pubkey')
  }
  return {
    encryptPk: buf.slice(0, 32),
    verifyPk: buf.slice(32),
    name: match ? match[2] : null,
    email: match && match[3] ? match[3].toLowerCase() : null,
    verify: function (sig, detachedBuf) {
      if (detachedBuf) {
        return nacl.sign.detached.verify(a(detachedBuf), a(sig), a(this.verifyPk)) ? detachedBuf : false
      }
      return Buffer(nacl.sign.open(a(sig), a(this.verifyPk)))
    },
    toString: function () {
      return salty.buildPubkey(this.encryptPk, this.verifyPk, this.name, this.email)
    },
    toBuffer: function () {
      return buf
    },
    toNiceString: function () {
      if (!this.name && !this.email) return this.toBuffer().toString('base64')
      var parts = []
      if (this.name) parts.push('"' + this.name + '"')
      if (this.email) parts.push('<' + this.email + '>')
      return parts.join(' ')
    }
  }
}

salty.buildPubkey = function (encryptPk, verifyPk, name, email) {
  var keys = Buffer.concat([
    encryptPk,
    verifyPk
  ])
  var parts = [
    'salty-id',
    base64url.escape(Buffer(keys).toString('base64'))
  ]
  if (name) parts.push('"' + name.replace(/"/g, '') + '"')
  if (email) parts.push('<' + email.replace(/>/g, '') + '>')
  return parts.join(' ')
}

salty.ephemeral = function (pubkey, nonce, totalSize) {
  nonce || (nonce = salty.nonce())
  var boxKey = nacl.box.keyPair()
  var k = Buffer(nacl.box.before(a(pubkey.encryptPk), a(boxKey.secretKey)))
  boxKey.secretKey = null
  var len = Buffer(8)
  len.writeDoubleBE(totalSize, 0)
  var encryptedLen = Buffer(nacl.box.after(a(len), a(nonce), a(k)))
  return {
    encryptPk: Buffer(boxKey.publicKey),
    nonce: nonce,
    createEncryptor: function (isLast) {
      return salty.encryptor(this.nonce, k, isLast)
    },
    toBuffer: function () {
      var buf = Buffer.concat([
        this.encryptPk,
        this.nonce,
        encryptedLen
      ])
      assert.equal(buf.length, salty.EPH_LENGTH)
      return buf
    },
    createHmac: function () {
      //console.error('hash k', k)
      return crypto.createHmac('sha256', k)
    }
  }
}

salty.parseEphemeral = function (wallet, buf) {
  try {
    assert.equal(buf.length, salty.EPH_LENGTH)
  }
  catch (e) {
    throw new Error('invalid ephemeral')
  }
  var encryptPk = buf.slice(0, 32)
  var nonce = buf.slice(32, 56)
  var encryptedLen = buf.slice(56)
  var k = Buffer(nacl.box.before(a(encryptPk), a(wallet.decryptSk)))
  var decryptedLen = Buffer(nacl.box.open.after(a(encryptedLen), a(nonce), a(k)))
  var totalSize = decryptedLen.readDoubleBE(0)
  return {
    encryptPk: encryptPk,
    nonce: nonce,
    totalSize: totalSize,
    createDecryptor: function (encryptedSize) {
      return salty.decryptor(this.nonce, k, encryptedSize - salty.EPH_LENGTH)
    },
    createHmac: function () {
      //console.error('hash k', k)
      return crypto.createHmac('sha256', k)
    }
  }
}

salty.loadWallet = function (inPath, cb) {
  fs.readFile(path.join(inPath, 'id_salty'), {encoding: 'utf8'}, function (err, str) {
    if (err && err.code === 'ENOENT') {
      err = new Error('No salty-wallet found. Type `salty init` to create one.')
      err.code = 'ENOENT'
      return cb(err)
    }
    if (err) return cb(err)
    if (str.indexOf('ENCRYPTED') !== -1) {
      process.stderr.write('Enter your passphrase: ')
      return prompt.password(null, function (passphrase) {
        console.error()
        withPrompt(passphrase)
      })
    }
    else withPrompt(null)
    function withPrompt (passphrase) {
      try {
        var pem = pemtools(str, 'SALTY WALLET', passphrase)
        var buf = pem.toBuffer()
        var wallet = salty.parseWallet(buf)
        passphrase = null
      }
      catch (e) {
        return cb(e)
      }
      salty.loadPubkey(inPath, function (err, pubkey) {
        if (err) return cb(err)
        wallet.pubkey = pubkey
        cb(null, wallet)
      })
    }
  })
}

salty.loadPubkey = function (inPath, cb) {
  fs.readFile(path.join(inPath, 'id_salty.pub'), {encoding: 'utf8'}, function (err, str) {
    if (err && err.code === 'ENOENT') {
      err = new Error('No salty-id found. Type `salty init` to create one.')
      err.code = 'ENOENT'
      return cb(err)
    }
    if (err) return cb(err)
    try {
      var pubkey = salty.parsePubkey(str)
    }
    catch (e) {
      return cb(e)
    }
    cb(null, pubkey)
  })
}

salty.writeWallet = function (outPath, name, email, cb) {
  salty.loadWallet(outPath, function (err, wallet, pubkey) {
    if (err && err.code === 'ENOENT') {
      console.error('No wallet found. Creating...')
      var boxKey = nacl.box.keyPair()
      var signKey = nacl.sign.keyPair()
      var buf = Buffer.concat([
        Buffer(boxKey.secretKey),
        Buffer(signKey.secretKey)
      ])
      wallet = salty.parseWallet(buf)
      var str = salty.buildPubkey(Buffer(boxKey.publicKey), Buffer(signKey.publicKey), name, email)
      pubkey = salty.parsePubkey(str)
      getPassphrase()
    }
    else if (err) return cb(err)
    else {
      process.stderr.write('Wallet found. Update your wallet? (y/n): ')
      prompt(null, function (resp) {
        if (resp.match(/^y/i)) {
          pubkey.name = name
          pubkey.email = email
          getPassphrase()
        }
        else {
          console.error('Cancelled.')
          cb()
        }
      })
    }
    function getPassphrase () {
      process.stderr.write('Create a passphrase: ')
      prompt(null, true, function (passphrase) {
        process.stderr.write('Confirm passphrase: ')
        prompt(null, true, function (passphrase2) {
          if (passphrase2 !== passphrase) {
            console.error('Passwords did not match!')
            return getPassphrase()
          } 
          var str = wallet.toString(passphrase)
          fs.writeFile(path.join(outPath, 'id_salty'), str + '\n', {mode: parseInt('0600', 8)}, function (err) {
            if (err) return cb(err)
            fs.writeFile(path.join(outPath, 'id_salty.pub'), pubkey.toString() + '\n', {mode: parseInt('0644', 8)}, function (err) {
              if (err) return cb(err)
              fs.writeFile(path.join(outPath, 'imported_keys'), pubkey.toString() + '\n', {mode: parseInt('0600', 8), flag: 'a+'}, function (err) {
                if (err) return cb(err)
                cb(null, wallet, pubkey)
              })
            })
          })
        })
      })
    }
  })
}

salty.parseWallet = function (buf) {
  try {
    assert.equal(buf.length, 96)
  }
  catch (e) {
    throw new Error('invalid wallet')
  }
  return {
    decryptSk: buf.slice(0, 32),
    signSk: buf.slice(32),
    sign: function (buf, detach) {
      if (detach) return Buffer(nacl.sign.detached(a(buf), a(this.signSk)))
      return Buffer(nacl.sign(a(buf), a(this.signSk)))
    },
    toBuffer: function () {
      return Buffer.concat([
        this.decryptSk,
        this.signSk
      ])
    },
    toString: function (passphrase) {
      return pemtools(this.toBuffer(), 'SALTY WALLET', passphrase).toString()
    }
  }
}

salty.encryptor = function (nonce, k, isLast) {
  //console.error('enc nonce', nonce)
  var n = nonce.slice(0, 16)
  var size = 0
  var encryptor = nacl.stream.createEncryptor(a(k), a(n), salty.MAX_CHUNK)
  var numChunks = 0
  return through(function write (data) {
    var encryptedChunk = encryptor.encryptChunk(a(data), isLast())
    //console.error('chunk', ++numChunks, encryptedChunk.length)
    this.queue(Buffer(encryptedChunk))
    size += encryptedChunk.length
    numChunks++
    if (isLast()) {
      encryptor.clean()
    }
  }, function end () {
    //console.error('total encrypted len', size)
    this.queue(null)
  })
}

salty.decryptor = function (nonce, k, totalSize) {
  //console.error('dec nonce', nonce)
  var n = nonce.slice(0, 16)
  var size = 0
  var numChunks = 0
  var decryptedSize = 0
  var decryptor = nacl.stream.createDecryptor(a(k), a(n), salty.MAX_CHUNK)
  var buf = Buffer('')
  //console.error('DECRYPTOR', nonce, k, totalSize)
  return through(function write (data) {
    size += data.length
    buf = Buffer.concat([buf, data])
    var isLast = size === totalSize
    while (buf.length) {
      var len = nacl.stream.readChunkLength(buf)
      if (buf.length < len + 20) {
        return
      }
      var chunk = buf.slice(0, len + 20)
      buf = buf.slice(len + 20)
      var decryptedChunk = decryptor.decryptChunk(a(chunk), !buf.length)
      //console.error('decrypt chunk', ++numChunks, decryptedChunk.length)
      decryptedSize += decryptedChunk.length
      this.queue(Buffer(decryptedChunk))
    }
    if (isLast) {
      decryptor.clean()
    }
  }, function end () {
    //console.error('total decrypted len', decryptedSize)
    this.queue(null)
  })
}
