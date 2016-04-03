var http = require('http');
var events = require('github-webhook-handler')({
  path: '/github',
  secret: process.env.WEBHOOK_SECRET
});
var port = process.env.PORT || 9207;

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

events.on('*', event =>{
  //make this more semantic
  var name = event.event;
  var payload = event.payload;
  Object.keys(event).forEach(key=>delete event[key]);
  event.name = name;
  Object.keys(payload).forEach(key=>event[key] = payload[key]);

  console.log(JSON.stringify(event, null, 2));

  //allow more granularity
  if(event.action)
    events.emit(event.name +'.'+ event.action, event);
});

require('fs').readdirSync('./scripts').forEach(file=>{
  file = './scripts/' + file;
  console.log('loading:', file);
  require(file)(events);
});

