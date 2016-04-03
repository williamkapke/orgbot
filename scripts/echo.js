var github = require('../github.js');

module.exports = function (org) {

  org.on('issue_comment.created', event=>{
    //this would be circular if we don't ignore ourself!
    if(!event.sender || !github.me || event.sender.id===github.me.id) return;

    var repo = event.repository;
    github.issues.createComment({
      user: repo.owner.login,
      repo: repo.name,
      number: event.issue.number,
      body: event.comment.body
    })
  });

};
