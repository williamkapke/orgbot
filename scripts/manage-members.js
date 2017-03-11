'use strict'

const P = require('effd')
const get = require('get-then')
const debug = require('debug')('manage-members')

const github = require('../github.js')

// we need this RegExp to have the global flag
const mentionsRegex = new RegExp(require('mentions-regex')().source, 'g')
const exclude = (a, b) => a.filter((x) => !b.find((y) => y === x))
const README = (file) => /^readme\.md$/i.test(file.filename || file) // array of strings or file objects

const ignoredErrors = new Set([
  'Not Applicable',
  'No members changed',
  'Members section not found',
  'Push is on non-default branch',
  'README not modified'
])
const logError = (err) => {
  if (ignoredErrors.has(err && err.message)) {
    return debug(err.message)
  }
  console.error(err)
}

module.exports = function (app) {
  app.on('push', (e, owner, repo) => onPush(e, owner, repo).catch(logError))
  app.on('pull_request.opened', (e, owner, repo) => onPullRequest(e, owner, repo).catch(logError))
  app.on('pull_request.synchronize', (e, owner, repo) => onPullRequest(e, owner, repo).catch(logError))
}

function onPullRequest (event, owner, repo) {
  const number = event.pull_request.number
  debug('onPullRequest %s %s %s', owner, repo, number)

  // ignore if not to the default branch
  if (event.pull_request.base.ref !== event.repository.default_branch) {
    return P.error('PR is to non-default branch')
  }

  return github.pullRequests.getFiles({ owner, repo, number, per_page: 100 })
  .then(github.find(README))
  .then((readme) => !readme ? P.error('README not modified') : readme.raw_url)
  // get the README and analyze it
  .then(get)
  .then(String)
  .then(parseTeamSection)
  .then((team) => findChangedMembers(owner, team.name, team.mentions))
  .then(createMessageBody)
  .then((message) =>
    // find a previous comment to update
    github.me()
    .then((me) =>
      github.issues.getComments({ owner, repo, number, per_page: 100 })
      .then(github.find((comment) => comment.user.login === me))
    )
    .then((comment) =>
      comment
        ? github.issues.editComment({ owner, repo, id: comment.id, message })
        : github.issues.createComment({ owner, repo, number, message })
    )
    .then(() => message)
  )
}

function onPush (event, org, repo) {
  debug('onPush %s %s', org, repo)

  // ignore if not to the default branch
  if (event.ref !== 'refs/heads/' + event.repository.default_branch) {
    return P.error('Push is on non-default branch')
  }

  // ignore if the readme wasn't changed
  // missed edge case: a push directly to master (no PR, so no merge)
  //   and readme change was not in the head commit
  const head = event.head_commit
  const readme = head.modified.find(README) || head.added.find(README)
  if (!readme) return P.error('README not modified')

  return get(`https://github.com/${org}/${repo}/raw/${head.id}/${readme}`)
  .then(String)
  .then(parseTeamSection)
  .then((team) => findChangedMembers(org, team.name, team.mentions))
  .then(updateMembers)
}

function updateMembers ({ id, added, removed }) {
  debug('updateMembers %s %j %j', id, added, removed)

  return P.all([].concat(
    added.map((username) =>
      github.orgs.addTeamMembership({ id, username }).catch(logError) // do not let errors stop processing
    ),
    removed.map((username) =>
      github.orgs.removeTeamMembership({ id, username }).catch(logError) // do not let errors stop processing
    )))
  .then(() => {
    // don't return anything to the promise chain. nothing should need/want it.
  })
}

function findChangedMembers (org, teamName, mentions) {
  // get the id of the team listed in the README
  return github.orgs.getTeams({ org, per_page: 100 })
  .then(github.find((t) => t.name === teamName))
  .then((team) =>
    !team
      ? P.error('Team Not Found: ' + teamName)
      // get the usernames of the team members
      : github.orgs.getTeamMembers({ id: team.id, per_page: 100 })
      .then(github.allPages)
      .then((members) => members.map((member) => member.login.toLocaleLowerCase()))
      .then((members) => ({
        org,
        id: team.id,
        team: teamName,
        added: exclude(mentions, members),
        removed: exclude(members, mentions)
      }))
  )
  .then((changes) =>
    !changes.added.length && !changes.removed.length
      ? P.error('No members changed')
      : changes
  )
}

function createMessageBody ({org, team, added, removed}) {
  var message = `This merge, if accepted, will cause changes to the @${org}/${team} team.\n`
  if (added.length) message += `- Add: @${added.join(', @')}\n`
  if (removed.length) message += `- Remove: @${removed.join(', @')}\n`
  debug(message)
  return message
}

function parseTeamSection (readmeContent) {
  const start = readmeContent.search(/<!-- team:\w/)
  const end = readmeContent.indexOf('<!-- team -->', start)
  if (start === -1 || end === -1) return P.error('Members section not found')

  const section = readmeContent.substring(start, end)
  const mentions = section.match(mentionsRegex) || []
  const result = {
    name: readmeContent.match(/<!-- team:([^ ]+)/)[1],
    mentions: mentions.map((mention) => mention.substr(2).toLocaleLowerCase())
  }
  debug('parseTeamSection %j', result)

  return P(result)
}

// expose for tests
module.exports.updateMembers = updateMembers
module.exports.findChangedMembers = findChangedMembers
module.exports.createMessageBody = createMessageBody
module.exports.parseTeamSection = parseTeamSection
module.exports.onPullRequest = onPullRequest
module.exports.onPush = onPush
