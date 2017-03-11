'use strict'

const P = require('effd')
const debug = P.passthrough(require('debug')('block-users'))
const moment = require('moment')
const github = require('../github.js')
const listUrl = require('url').parse(process.env.BLOCK_LIST_URL || '')
const [org, repo, branch, ...segments] = (listUrl.pathname || '').substr(1).split('/')
const path = segments && segments.join('/')
debug(`org=%s repo=%s branch=%s path=%s`, org, repo, branch, path)()

const ignoredErrors = new Set([
  'Wrong repo',
  'Push is on non-default branch'
])
const logError = (err) => {
  if (ignoredErrors.has(err && err.message)) {
    return debug(err.message)()
  }
  console.error(err)
}

const getBlockLog = (ref = branch) =>
  debug('downloading %s', path).then(() =>
    github.repos.getContent({ owner: org, repo, path, ref, headers: { Accept: 'application/vnd.github.v3.raw' } })
    .then((res) =>
      res.data.split('\n')
      .filter((line, i) => i && line) // remove first line (header) and empty lines
      .map((line) => line.split(','))
      .map(([username, expires]) => [username, moment(expires, moment.ISO_8601)])
    )
  )

const getBlockedUsers = () =>
  debug('getting the list of currently blocked users').then(() =>
    github.orgs.getBlockedUsers({ org, per_page: 100 })
    .then(github.allPages)
    .then((res) => res.data.map((u) => u.login))
    .catch((err) => P.error(
      err.code === 404
        ? 'Unable to access block list (404 response). The bot does ' +
          'not have admin access to the org listed in the BLOCK_LIST_URL'
        : err
    ))
  )

// makes a distinct list of the users and determines of they should be blocked or not
const decideFate = (list) => {
  const distinct = {}
  const now = moment()
  list.forEach(([user, expires]) => (
    distinct[user] = !expires.isValid() || expires.isSameOrAfter(now) ? 'block' : 'unblock'
  ))
  return distinct
}

const buildChangeInfo = ([actions, currentlyBlocked]) => {
  const changes = { block: [], unblock: [] }
  Object.entries(actions).forEach(([user, action]) => {
    let isBlocked = currentlyBlocked.includes(user)
    if ((action === 'block' && !isBlocked) || (action === 'unblock' && isBlocked)) {
      changes[action].push(user)
    }
  })
  return changes
}

const checkForChanges = (ref) =>
  Promise.all([
    getBlockLog(ref).then(decideFate),
    getBlockedUsers()
  ])
  .then(buildChangeInfo)

const act = (username, action) =>
  debug('attempting to %s %s', action, username).then(() =>
    // calls blockUser or unblockUser
    github.orgs[action + 'User']({ org, username })
    .then(() => ({ username, action }))
    .catch((e) => ({ username, action, error: JSON.parse(e.message).message || e.message }))
  )

const processChanges = (changes) =>
  Promise.all([].concat(
    changes.unblock.map((user) => act(user, 'unblock')),
    changes.block.map((user) => act(user, 'block'))
  ))

const findBlockListCommit = () =>
  debug('finding the latest commit to the block list').then(() =>
    github.repos.getCommits({ owner: org, repo, path, per_page: 1 })
    .then((res) => res.data[0].sha)
  )

const createCommitComment = (sha, body) =>
    body
      ? debug('creating comment for %s\n%O', sha, () => body.split('\n')).then(() =>
          github.repos.createCommitComment({ owner: org, repo, sha, body })
          .then(() => body) // send back the message to be logged
        )
      : P.done('No Changes')

const createMessageBody = (results) =>
  results
  .map(({username, action, error = false}) =>
    error
      ? `@${username} failed to ${action}: ${error}`
      : `@${username} was ${action}ed`
  )
  .join('\n')

const onPush = (e, owner, repo2) => {
  debug('onPush %s %s', org, repo2)

  // ignore if not to the default branch
  if (e.ref !== 'refs/heads/' + e.repository.default_branch) {
    return P.error('Push is on non-default branch')
  }
  if (owner !== org || repo !== repo2) {
    return P.error('Wrong repo')
  }
  return sync()
}

// this is the main entry for blocking/unblocking
const sync = () => {
  console.log('syncing block list...')

  return checkForChanges()
  .then(processChanges)
  .then((results) =>
    findBlockListCommit()
    .then((sha) =>
      createCommitComment(sha, createMessageBody(results))
    )
  )
  .then(console.log) // logs the message
  .catch(logError)
}

module.exports = function (app) {
  if (listUrl.hostname !== 'raw.githubusercontent.com' || !org || !repo || !branch || !path) {
    return console.log('Invalid BLOCK_LIST_URL:', process.env.BLOCK_LIST_URL)
  }

  app.on('push', (e, owner, repo) => onPush(e, owner, repo).catch(logError))
}

module.exports.sync = sync
// export for testing
module.exports.getBlockLog = getBlockLog
module.exports.getBlockedUsers = getBlockedUsers
module.exports.decideFate = decideFate
module.exports.buildChangeInfo = buildChangeInfo
module.exports.act = act
module.exports.findBlockListCommit = findBlockListCommit
module.exports.createCommitComment = createCommitComment
module.exports.createMessageBody = createMessageBody
