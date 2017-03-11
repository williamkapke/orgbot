const proxyquire = require('proxyquire')
const assert = require('assert')
const P = require('effd')
const readFixture = require('./utils.js').readFixture
const asyncish = (cb) => setTimeout(cb, Math.random() * 10)

const teamsMembers = {
  '222': [ 'aaa', 'Bbb', 'cCC', 'DDD' ].map((x) => ({ login: x })),
  '333': [ 'alpha', 'omega', 'phi' ].map((x) => ({ login: x })),
  '444': [ 'a', 'b', 'e' ].map((x) => ({ login: x }))
}
const prFiles = {
  '12': [{ filename: 'docs/README.md' }],
  '34': [{ filename: 'app.js' }, { filename: 'package.json' }, { filename: 'readme/md' }],
  '56': [{ filename: 'reaDme.Md', raw_url: 'readme' }]
}
const manageMembers = proxyquire('../scripts/manage-members.js', {
  '../github.js': {
    issues: {
      getComments: () => P([]),
      createComment: () => P(),
      editComment: () => P()
    },
    pullRequests: {
      getFiles: (options) => {
        return P(prFiles[options.number])
      }
    },
    orgs: {
      getTeams: () => Promise.resolve([
        { name: 'foo', id: 111 },
        { name: 'bar', id: 222 },
        { name: 'botsters', id: 444 },
        { name: 'baz', id: 333 }
      ]),
      getTeamMembers: (options) => Promise.resolve(teamsMembers[options.id]),
      addTeamMembership: (options) => P((Ø) => {
        const members = teamsMembers[options.id]
        asyncish(() => {
          if (!members.find((m) => m.login === options.username)) {
            members.push({ login: options.username })
          }
          Ø.done()
        })
      }),
      removeTeamMembership: (options) => P((Ø) => {
        const members = teamsMembers[options.id]
        asyncish(() => {
          const index = members.findIndex((m) => m.login === options.username)
          if (index > -1) members.splice(index, 1)
          Ø.done()
        })
      })
    },
    find: (x) => (array) => Promise.resolve(array.find(x)),
    me: () => Promise.resolve({ login: 'hubbed' }),
    allPages: (x) => Promise.resolve(x),
    '@noCallThru': true
  },
  'get-then': (url) => {
    if (url === 'http://404') return P.accept({ statusCode: 404 })
    if (url === 'http://error') return P.reject(new Error())
    if (url === 'readme' || url === 'https://github.com/undefined/undefined/raw/undefined/README.md') {
      return readFixture('README.md')
    }

    return P(url)
  }
})

// ... the tests:
describe('manage-members', () => {
  describe('updateMembers', () => {
    it('should add & remove the changed memebers', () =>
      manageMembers.updateMembers({ id: 333, added: ['bob', 'omega', 'alice'], removed: ['alpha', 'idontexist'] })
      .then(() => { // omega, phi, bob, alice
        const members = teamsMembers[333].map((m) => m.login)
        assert.equal(members.length, 4)
        assert(members.includes('omega'))
        assert(members.includes('bob'))
        assert(members.includes('alice'))
        assert(members.includes('phi'))
      })
    )
  })

  describe('findChangedMembers', () => {
    it('should reject if Team Not Found', () =>
      manageMembers.findChangedMembers('nodejs', 'botfolks', ['xray', 'yarn', 'zulu'])
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert(/^Team Not Found/.test(err.message))
      })
    )
    it('should determine additions and removals', () =>
      manageMembers.findChangedMembers('nodejs', 'bar', ['xray', 'aaa', 'yarn', 'zulu'])
      .then((changes) => {
        assert.strictEqual(changes.org, 'nodejs')
        assert.strictEqual(changes.id, 222)
        assert.deepStrictEqual(changes.added, ['xray', 'yarn', 'zulu'])
        assert.deepStrictEqual(changes.removed, ['bbb', 'ccc', 'ddd'])
      })
    )
  })

  describe('createMessageBody', () => {
    it('should return undefined if no changes', () => {
      var messageBody = manageMembers.createMessageBody({
        org: 'nodejs',
        team: 'bot',
        added: ['a', 'b'],
        removed: ['d', 'e']
      })
      assert.strictEqual(messageBody, 'This merge, if accepted, will cause changes to the @nodejs/bot team.\n- Add: @a, @b\n- Remove: @d, @e\n')
    })
  })

  describe('parseTeamSection', () => {
    it('should reject if special comment not found', () =>
      manageMembers.parseTeamSection("## This README doesn't have the special `team` comment")
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'Members section not found')
      })
    )
    it("should reject if special comment isn't JUST right", () =>
      manageMembers.parseTeamSection(
        '## Hello\n ## Members <!--team: botsters -->\nThe spacing is off\n<!-- team -->\n# License\nMIT\n'
      )
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'Members section not found')
      })
    )
    it('should return empty array if no mentions found', () =>
      manageMembers.parseTeamSection(
        '## Hello\n ## Members <!-- team:botsters -->\nno mentions\n<!-- team -->\n# License\nMIT\n'
      )
      .then((data) => {
        assert(data instanceof Object)
        assert(data.mentions instanceof Array)
        assert.strictEqual(data.name, 'botsters')
        assert.strictEqual(data.mentions.length, 0)
      })
    )
    it('should return array of mentions found', () =>
      readFixture('README.md')
      .then(manageMembers.parseTeamSection)
      .then((data) => {
        assert(data instanceof Object)
        assert(data.mentions instanceof Array)
        assert.strictEqual(data.name, 'botsters')
        assert.deepStrictEqual(data.mentions, ['a', 'b', 'e'])
      })
    )
  })

  describe('onPullRequest', () => {
    after(() => {
      teamsMembers[444] = ['a', 'b', 'e'].map((x) => ({ login: x }))
    })
    it('should ignore non-default branch', () =>
      readFixture('pull_request.opened.json')
      .then(JSON.parse)
      .then((pr) => (pr.repository.default_branch = 'not-master') && pr)
      .then(manageMembers.onPullRequest)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual('PR is to non-default branch', err.message)
      })
    )
    it('should ignore non-root level README', () =>
      // bare min event data to get it to the list with a non-root readme
      P({ pull_request: { number: 12, base: {} }, repository: {} })
      .then(manageMembers.onPullRequest)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'README not modified')
      })
    )
    it('should ignore if README not in changed files', () =>
      // bare min event data to get it to the list without a readme.md
      P({ pull_request: { number: 34, base: {} }, repository: {} })
      .then(manageMembers.onPullRequest)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'README not modified')
      })
    )
    it('should ignore if README changed- but members did not', () =>
      // bare min event data to get it to the list with a readme.md change
      P({ pull_request: { number: 56, base: {} }, repository: {} })
      .then(manageMembers.onPullRequest)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'No members changed')
      })
    )
    it('should process members added & removed', () => {
      teamsMembers[444] = ['a', 'x', 'e', 'y'].map((x) => ({ login: x }))
      // bare min event data to get it to the list with a readme.md change
      return P({ pull_request: { number: 56, base: {} }, repository: {} })
      .then(manageMembers.onPullRequest)
      .then((commentBody) => {
        const expected =
          'This merge, if accepted, will cause changes to the @undefined/botsters team.\n' +
          '- Add: @b\n' +
          '- Remove: @x, @y\n'
        assert.strictEqual(commentBody, expected)
      })
    })
  })

  describe('onPush', () => {
    after(() => {
      teamsMembers[444] = ['a', 'b', 'e'].map((x) => ({ login: x }))
    })
    it('should ignore non-default branch', () =>
      P({ ref: 'refs/heads/non-master', repository: { default_branch: 'master' } })
      .then((pr) => (pr.repository.default_branch = 'not-master') && pr)
      .then(manageMembers.onPush)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual('Push is on non-default branch', err.message)
      })
    )
    it('should ignore if README not in changed files', () =>
      // bare min event data without a readme.md change
      P({ ref: 'refs/heads/undefined', repository: {}, head_commit: { modified: [], added: [] } })
      .then(manageMembers.onPush)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'README not modified')
      })
    )
    it('should ignore non-root level README changes', () =>
      // bare min event data with a non-root readme.md change
      P({ ref: 'refs/heads/undefined', repository: {}, head_commit: { modified: ['docs/README.md'], added: [] } })
      .then(manageMembers.onPush)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'README not modified')
      })
    )
    it('should ignore if README changed- but members did not', () =>
      // bare min event data with a readme.md change
      P({ ref: 'refs/heads/undefined', repository: {}, head_commit: { modified: ['README.md'], added: [] } })
      .then(manageMembers.onPush)
      .then(assert.fail)
      .catch((err) => {
        assert(err instanceof Error)
        assert.strictEqual(err.message, 'No members changed')
      })
    )
    it('should process members added & removed', () => {
      teamsMembers[444] = ['a', 'x', 'e', 'y'].map((x) => ({ login: x }))
      after(() => {
        teamsMembers[444] = ['a', 'b', 'e'].map((x) => ({ login: x }))
      })
      // bare min event data with a readme.md change
      return P({ ref: 'refs/heads/undefined', repository: {}, head_commit: { modified: ['README.md'], added: [] } })
      .then(manageMembers.onPush)
      .then(() => {
        assert.strictEqual(teamsMembers[444].length, 3)
        const members = teamsMembers[444].map((m) => m.login)
        assert(members.includes('a'))
        assert(members.includes('b'))
        assert(members.includes('e'))
      })
    })
  })
})
