var ƒ = require('effd');
var GitHubApi = require("github");
var github = new GitHubApi({ debug:!!process.env.DEBUG, version: "3.0.0" });

github.authenticate({
  type: "oauth",
  token: process.env.GITHUB_TOKEN
});

//livin' in the Promise land...
module.exports = {
  gitdata: ƒ.promisify(github.gitdata),
  issues: ƒ.promisify(github.issues),
  orgs: ƒ.promisify(github.orgs),
  pullRequests: ƒ.promisify(github.pullRequests),
  repos: ƒ.promisify(github.repos),
  user: ƒ.promisify(github.user)
};

module.exports.user.get({})
.then(me=>{
  console.log('authenticated as:', me.login);
  module.exports.me = me
})
.catch(console.log);
