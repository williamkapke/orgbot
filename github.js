'use strict'

require('dotenv').load({ silent: true })

const debug = require('debug')('github')
const GitHubApi = require('github')
const github = new GitHubApi({
  debug: debug.enabled,
  headers: { 'user-agent': 'orgbot v1' }
})

// see: https://github.com/mikedeboer/node-github/pull/517
github.responseHeaders.push('x-github-media-type')

github.authenticate({
  type: 'oauth',
  token: process.env.GITHUB_TOKEN
})

// store/cache info about the authenticated user
var _me = () => {
  const result = github.users.get({})
  .then((res) => {
    console.log('authenticated as:', res.data.login)
    return res.data
  })
  .catch((err) => {
    console.error('authentication failed', err)
    return Promise.reject(err)
  })

  // overwrite the original so that this is only done once
  _me = () => result
  return result
}
github.me = () => _me()

// Gets all pages of a paged response
// example:
//   github.orgs.getTeams({ org:'noduh' })
//   .then(github.allPages)
//   .then(console.log)
github.allPages = (res1, out = []) =>
  github.hasNextPage(res1)
    ? github.getNextPage(res1, headers(res1))
      .then((res2) => github.allPages(res2, out.concat(res1.data)))
    : { data: out.concat(res1.data) }

// Pages through responses until the predicate matches. Returns matched item.
// example:
//   github.orgs.getTeams({ org:'noduh' })
//   .then(github.find(t => t.name === 'testers'))
//   .then(console.log)
github.find = (predicate) => {
  const finder = (res) => {
    const found = res.data.find(predicate)
    if (typeof found !== 'undefined') return found

    return github.hasNextPage(res) && github.getNextPage(res, headers(res)).then(finder)
  }
  return finder
}

// see: https://github.com/mikedeboer/node-github/pull/517
function headers (res) {
  const headers = {}
  const reqType = res.meta['x-github-media-type']
  if (reqType) headers.Accept = 'application/vnd.' + reqType.replace('; format=', '.')
  return headers
}

module.exports = github
