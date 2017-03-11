'use strict'

const fs = require('fs')
const path = require('path')
const P = require('effd')
const readFile = P.promisify(fs.readFile)
const debug = require('debug')('utils')

module.exports = {
  readFixture: (filename) => {
    const file = path.join(__dirname, 'fixtures', filename)
    debug('readFixture', file)
    return readFile(file).then(String)
  }
}
