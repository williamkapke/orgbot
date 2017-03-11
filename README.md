# orgbot

Giving Owner access gives a person full access to the account.
Such as:
- Delete __the organization__
- Access all repositories
- View/Edit billing information
- Delete/Transfer all repositories
- Manage/Delete all teams
- Access the audit log

...that's a lot of risk! ...and accidents _DO_ happen!

Access to the GitHub API is much more granular. So, **orgbot** was created!
It responds to GitHub webhook events to adding people to teams and to block
guests that are unwanted.
<br>
<br>
<br>
<br>
## Managing Teams
A goal of this bot was to also provide some transparency for visitors. A repo's
README is used to list the team members. When the list changes, the bot syncs
the changes to the GitHub Team.

### Modify a repo's README.md

Place a special `<!-- team:name -->` comment in the repo's `README.md`:

``` markdown
## Members
<!-- team:website - all mentions in this section will be added to the team by the bot -->
- [@williamkapke](http://github.com/williamkapke)
- [@hubbed](http://github.com/hubbed)

<!-- team -->
```

NOTE: You must specify the team's `name` in the opening comment like shown above!
### Create/update a PR

When a PR is submitted or changes are pushed, the bot will evaluate the commit(s)
for changes to the `README.md` file. If changed, it will extract the content
within the `<!-- team -->` comments find all `@mentions` and do a diff with the
list of current team members.

### Accept the PR

Accepting a PR sends a `push` event. So, any push- even ones outside the PR
process, will get picked up by the bot.

When the bot receives the `push` event, it will do the same parsing + evaluating
as when the PR was created/updated, but instead of creating a comment- it
applies the additions AND removals to the team (if any).
<br>
<br>
<br>
<br>
## Blocking/Unblocking Users
To use the bot to block users,

### Create a block file
A block files is a [CSV](https://en.wikipedia.org/wiki/Comma-separated_values)
list of usernames, the expiration of the block, and an optional comment. The
first line is used for column headers and will be ignored.

Example file:
```
username,expires,note
ghost,,This is a special account used by GitHub as a placeholder.
user22,2016-08-20T00:00,Needs to cool off
evil1,,Person harassed others
bully66,2018-03-16T18:00,Violated the CoC
```
<sup>NOTE: `user22` in this example above has passed their timeout period</sup>

The file:
- Works like a log file, records at the top are the oldest. New ones are added
to the bottom.
- If a user is listed more than once, the newest entry is only considered.
- No `expires` value, or an invalid one, means the block does not expire.
- If a user is blocked, but they are not listed, they remain blocked.
- Adding a user's name and a date in the past will cause an immediate unblock.
- Can be truncated. Lines can be removed.
- Not guaranteed to match the actual GitHub list of blocked users.
- Is evaluated for additions/removals:
	- On any commit
	- By executing `node sync-blocks` (via scheduled task)
<br>
<br>
<br>
<br>

## Setup

### Environment variables
You will need these environment variables set:
```
GITHUB_TOKEN="<your_github_personal_access_token"

# optional:
GITHUB_WEBHOOK_SECRET="this is a secret you set in the webhook setup"
WEBHOOK_URL="/path/for/github/to/post/events/to"
BLOCK_LIST_URL="https://raw.githubusercontent.com/<your_org>/<some_repo>/master/<your_block_file.csv>"
```

### Create a Bot Account
Create a new GitHub account that will only be used by your bot. Keep the login
information secure.

### Give the Bot Account Owner access
To perform admin actions, the account will need to be an Owner. That's why it's
important to keep the login secure!

### Create a Personal Access Token
Under the Bot's account settings, create a personal access token and assign the
`admin:org` (includes `write:org` & `read:org`) permissions

### Create a Webhook
To to any repository you would like the bot to manage and create a webhook that
POSTs to your server's url and path specified in the `WEBHOOK_URL` environment
variable.

### Create a Scheduled Task
Create a scheduled task that executes `node sync-blocks.js` for any interval you
desire. This will allow users to be unblocked after their block expiration.

