'use strict'

require('dotenv').load({ silent: true })

const http = require('http')
const bl = require('bl')
const glob = require('glob')
const crypto = require('crypto')
const debug = require('debug')('server')

const url = process.env.WEBHOOK_URL || '/'
const port = process.env.PORT || 3000
const scripts = process.env.SCRIPTS || './scripts/**/*.js'
const secret = process.env.GITHUB_WEBHOOK_SECRET

const sign = (blob) => 'sha1=' + crypto.createHmac('sha1', secret).update(blob).digest('hex')

http.ServerResponse.prototype.status = function (code, message) {
  this.statusCode = code
  this.statusMessage = message
  return this
}

const app = http.createServer((req, res) => {
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} => ${res.statusCode} ${res.statusMessage}`)
  })

  if (req.method !== 'POST' && req.url !== url) {
    return res.status(404).end()
  }

  const event = req.headers['x-github-event']
  const signature = req.headers['x-hub-signature']

  if (!event) return res.status(400, 'Missing x-github-event Header').end()
  if (!signature) return res.status(400, 'Missing x-hub-signature Header').end()

  req.pipe(bl(function (err, data) {
    if (err) return res.status(400, 'Error reading input').end()
    if (secret && signature !== sign(data)) {
      return res.status(400, 'Signature mismatch').end()
    }

    data = tryParseJSON(data)
    if (!data) return res.status(400, 'Invalid JSON').end()

    const repo = data.repository.name
    const org = data.repository.owner.login || data.organization.login
    data.action = data.action ? event + '.' + data.action : event
    debug(data)

    app.emit(data.action, data, org, repo)

    res.end()
  }))
})
.listen(port, () => {
  console.log('orgbot listening on port', port)
})

// load the scripts
glob.sync(scripts).forEach((file) => {
  console.log('Loading:', file)
  require(file)(app)
})

function tryParseJSON (data) {
  data = String(data)
  try {
    return JSON.parse(data)
  } catch (e) {
    debug(data)
    debug(e)
  }
}
