var http = require('http');
var port = process.env.PORT || 9207;

var events = require('github-webhook-handler')({
  path: '/github',
  secret: process.env.WEBHOOK_SECRET,
  emit: (headers, data)=>{
    data.action = (data.action+'.'||'') + headers['x-github-event'];
    console.log(JSON.stringify(data, null, 2));
    handler.emit(data.action, data);
  }
});

http.createServer((req, res) =>
  events(req, res, _=> {
    res.statusCode = 404;
    res.end('no such location')
  })
)
.listen(port, _=>console.log('hookbot listening on port:', port));

events.on('error', err =>
  console.error('Error:', err.message)
);

require('fs').readdirSync('./scripts').forEach(file=>{
  file = './scripts/' + file;
  console.log('loading:', file);
  require(file)(events);
});

