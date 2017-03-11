require('dotenv').load({ silent: true })

const P = require('effd')
const proxyquire = require('proxyquire')
const readFixture = require('./utils.js').readFixture
const moment = require('moment')

const assert = require('assert')
assert.isArray = (value) => assert(Array.isArray(value), 'Expected value to be an Array')
assert.isString = (value) => assert(typeof value === 'string', 'Expected value to be a String')

const blockUsers = proxyquire('../scripts/block-users.js', {
  '../github.js': {
    repos: {
      getContent: () => readFixture('blocks.csv').then((c) => ({ data: c })),
      getCommits: () => P({ data: [ { sha: '352e5c87c1fef5b16932f05e5c45d83a9c93f9bf' } ] }),
      createCommitComment: () => P.done()
    },
    orgs: {
      getBlockedUsers: () => readFixture('blocked-users.json').then(JSON.parse).then((c) => ({ data: c })),
      blockUser: ({ org, username }) =>
        /missing/.test(username)
          ? P.error('{"message":"Not Found"}')
        : username === 'alreadyblocked'
          ? P.error('{"message":"Already blocking user"}')
        : username === 'spam'
          ? P.error('{"message":"User has been flaged as spam"}')

        : Promise.resolve(),
      unblockUser: ({ org, username }) =>
        username === 'missing'
          ? P.error('{"message":"Not Found"}')
          : Promise.resolve()
    },
    allPages: (x) => Promise.resolve(x),
    '@noCallThru': true
  }
})

describe('block-users', () => {
  describe('getBlockLog', () => {
    it('should fetch and parse the block list', () =>
      blockUsers.getBlockLog()
      .then((results) => {
        assert.isArray(results)
        results.forEach((item) => {
          assert.isArray(item)
          assert.isString(item[0])
          assert(item[1] instanceof moment)
        })

        assert.equal(results[0][1].isValid(), false)
        assert.equal(results[1][1].isValid(), false)
        assert.equal(results[2][1].isValid(), false)
        assert.equal(results[3][1].isValid(), false)
        assert.equal(results[4][1].isSame('2016-01-01T00:00:00.000'), true)
      })
    )
  })

  describe('getBlockedUsers', () => {
    it('should get the list of currently blocked users', () =>
      blockUsers.getBlockedUsers()
      .then((users) => {
        assert.deepStrictEqual(users, require('./fixtures/blocked-users.json').map((u) => u.login))
      })
    )
  })

  describe('decideFate', () => {
    it('should compare a list of users with the existing blocked users to determine their fate', () => {
      const fate = blockUsers.decideFate([['williamkapke', moment('')], ['evil1', moment('2016-01-01')]])
      assert.deepStrictEqual(fate, { williamkapke: 'block', evil1: 'unblock' })
    })
  })

  describe('buildChangeInfo', () => {
    it('should ', () => {
      const actions = { williamkapke: 'block', evil1: 'unblock' }
      const currentlyBlocked = require('./fixtures/blocked-users.json').map((u) => u.login)
      const changes = blockUsers.buildChangeInfo([actions, currentlyBlocked])
      assert.deepStrictEqual(changes, { block: [ 'williamkapke' ], unblock: [ 'evil1' ] })
    })
  })

  describe('act', () => {
    it('should block a user', () =>
      blockUsers.act('williamkapke', 'block')
      .then((result) => {
        assert.deepStrictEqual(result, { username: 'williamkapke', action: 'block' })
      })
    )
    it('should handle a user that no longer exists', () =>
      blockUsers.act('missing', 'block')
      .then((result) => {
        assert.deepStrictEqual(result, { username: 'missing', action: 'block', error: 'Not Found' })
      })
    )
    it('should handle a user that is already blocked', () =>
      blockUsers.act('alreadyblocked', 'block')
      .then((result) => {
        assert.deepStrictEqual(result, { username: 'alreadyblocked', action: 'block', error: 'Already blocking user' })
      })
    )
    it('should handle a user that is marked as spam', () =>
      blockUsers.act('spam', 'block')
      .then((result) => {
        assert.deepStrictEqual(result, { username: 'spam', action: 'block', error: 'User has been flaged as spam' })
      })
    )
  })

  describe('findBlockListCommit', () => {
    it('should find the latest commit to the block list', () =>
      blockUsers.findBlockListCommit()
      .then((sha) => {
        assert.equal(sha, '352e5c87c1fef5b16932f05e5c45d83a9c93f9bf')
      })
    )
  })

  describe('createCommitComment', () => {
    it('should create a comment on a commit', () =>
      blockUsers.createCommitComment('123456', 'Helloooo')
    )
  })

  describe('createMessageBody', () => {
    it('should ', () => {
      const message = blockUsers.createMessageBody([
        { username: 'williamkapke', action: 'block' },
        { username: 'missing', action: 'block', error: 'Not Found' },
        { username: 'alreadyblocked', action: 'block', error: 'Already blocking user' },
        { username: 'spam', action: 'block', error: 'User has been flaged as spam' }
      ])
      const expected =
        '@williamkapke was blocked\n' +
        '@missing failed to block: Not Found\n' +
        '@alreadyblocked failed to block: Already blocking user\n' +
        '@spam failed to block: User has been flaged as spam'
      assert.equal(message, expected)
    })
  })
})
