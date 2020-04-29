var http = require("http");
var path = require("path");
var express = require("express");
var bodyParser = require('body-parser');
var formidable = require('formidable');
var fs = require('fs');
const mysql = require('mysql');

var app = express();

var mysqlConnectionUsers = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'bangel_users',
  // multipleStatements: true
});

var mysqlConnectionMessages = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bangel_messages'
});

mysqlConnectionUsers.connect((err) => {
  if (!err)
    console.log('DB Users connection succeded.');
  else
    console.log('DB Users connection failed \n Error : ' + JSON.stringify(err, undefined, 2));
});

mysqlConnectionMessages.connect((err) => {
    if (!err)
        console.log('DB Messages connection succeded.');
    else
        console.log('DB Messages connection failed \n Error : ' + JSON.stringify(err, undefined, 2));
});

// SELECT u.username
// FROM bangel_users.bangel_user u, bangel_users.bangel_user_contacts c, (select id from bangel_users.bangel_user u where u.username='creator_1') m
// WHERE (c.user_id = m.id AND c.contacts_id = u.id) OR (c.user_id = u.id AND c.contacts_id = m.id);

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

// Express CORS setup
app.use(function (req, res, next) {
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});

var server = app.listen(3000, () => console.log("Express server is running at port no : 3000"));

var io = require('socket.io').listen(server);

//var path = __dirname + '/views/';

var usersCollection = [];
var friendsCollection = [];

// Express routes
app.set("view engine", "vash");

app.use("/Uploads", express.static(path.join(__dirname, 'Uploads')));

// app.get("*", function(req, res) {
//   res.render("index");
// });

// var friends = [];
//Get all username contacts by usernames
app.get('/contacts/:username', (req, res) => {
  var friends = [];
  var sql = "SELECT u.username FROM bangel_user u, bangel_user_contacts c, (select id from bangel_user u where u.username = ?) m WHERE (c.user_id = m.id AND c.contacts_id = u.id) OR (c.user_id = u.id AND c.contacts_id = m.id)";
  mysqlConnectionUsers.query(sql, [req.params.username], (err, rows, fields) => {
    if (!err) {
      for(let i = 0; i < rows.length; i++) {
        friends.push(rows[i].username);
      }
      res.send(friends);
    }
    else
      console.log(err);
  })
});

app.post('/messages', function(req, res) {

  var transmitterId = req.body.userId;
  // console.log("transmitterId : " + req.body.userId)
  // console.log("receiverId : " + req.body.destinataryId)
  var receiverId = req.body.destinataryId;

  var transmitterUsername = usersCollection.find(x => x.participant.id == req.body.userId).participant.displayName;
  var receiverUsername = usersCollection.find(x => x.participant.id == req.body.destinataryId).participant.displayName;

  // console.log("transmitterId : " + req.body.userId)
  // console.log("receiverId : " + req.body.destinataryId)


  var msgHistory = [];
  var sql = "SELECT * FROM message_socket_io WHERE (from_id = '" + transmitterUsername + "' AND to_id = '" + receiverUsername + "')";
  sql += " OR (to_id = '" + transmitterUsername + "' AND from_id = '" + receiverUsername + "') ORDER BY id ASC";

  mysqlConnectionMessages.query(sql, (err, rows, fields) => {
    if (!err) {
      console.log("Vous avez choisi -> " + receiverUsername);
      for (var msg of rows) {
        // let tempMsg :Message = new Message();
        // console.log("from id is ", msg.from_id);
        // console.log("Vous avez choisi -> " + receiverUsername);
        // var tempMsg = { fromId: msg.from_id, toId: msg.to_id, message: msg.message};
        var tempMsg;

        if (transmitterUsername == msg.from_id) {
          tempMsg = { fromId: req.body.userId, toId: req.body.destinataryId, message: msg.message, dateSent: msg.date_sent};
        } else {
          tempMsg = { fromId: req.body.destinataryId, toId: req.body.userId, message: msg.message, dateSent: msg.date_sent};
        }

        msgHistory.push(tempMsg);
      }
      res.send(msgHistory);
    }
    else
      console.log(err);
  })
});


app.post("/listFriends", function(req, res) {
  var clonedArray = usersCollection.slice();

  // Getting the userId from the request body as this is just a demo 
  // Ideally in a production application you would change this to a session value or something else
  var i = usersCollection.findIndex(x => x.participant.id == req.body.userId);
  clonedArray.splice(i,1);

  var friends = req.body.friends;
  clonedArray = clonedArray.filter( user => friends.includes(user.participant.displayName) );

  res.json(clonedArray);
});

app.post('/uploadFile', function (req, res){
  let form = new formidable.IncomingForm();
  let ngChatDestinataryUserId;

  if (!fs.existsSync("/Uploads")){
    fs.mkdirSync("/Uploads");
  }
  
  form.parse(req)
  .on('field', function (name, field) {
    // You must always validate this with your backend logic
    if (name === 'ng-chat-participant-id')
      ngChatDestinataryUserId = field;
  })
  .on('fileBegin', function (name, file){
      file.path = `${__dirname}/Uploads/${file.name}`;
  })
  .on('file', function (name, file){
    console.log('Uploaded ' + file.name);

    // Push socket IO status
    let message = {
      type: 2, // MessageType.File = 2
      //fromId: ngChatSenderUserId, fromId will be set by the angular component after receiving the http response
      toId: ngChatDestinataryUserId,
      message: file.name,
      mimeType: file.type,
      fileSizeInBytes: file.size,
      downloadUrl:  `http://localhost:3000/Uploads/${file.name}`
    };

    console.log("Returning file message:");
    console.log(message);

    res.status(200);
    res.json(message);
  });
});

/*
socket.on waits for the event. Whenever that event is triggered the callback function is called.

io.emit is used to emit the message to all sockets connected to it.
*/

// Socket.io operations
io.on('connection', function(socket) {

  socket.on('join', function(username) {
    // Same contract as ng-chat.User
    var index = usersCollection.findIndex(x => x.participant.displayName == username);

    if(index != -1) {
      usersCollection[index].participant.id = socket.id;
      usersCollection[index].participant.status =; 0
      console.log(username + " has joined the chat room with socketId : " + socket.id);
    } else {
      usersCollection.push({
          participant: {
              id: socket.id, // Assigning the socket ID as the user ID in this example
              displayName: username,
              status: 0, // ng-chat UserStatus.Online,
              avatar: null
          }
      });

      var sql = "SELECT u.username FROM bangel_user u, bangel_user_contacts c, (select id from bangel_user u where u.username = ?) m WHERE (c.user_id = m.id AND c.contacts_id = u.id) OR (c.user_id = u.id AND c.contacts_id = m.id)";
      mysqlConnectionUsers.query(sql, [username], (err, rows, fields) => {
        if (!err) {
          for (var user of rows) {
            var index = usersCollection.findIndex(x => x.participant.displayName == user.username);
            if(index == -1) {
              usersCollection.push({
                participant: {
                  id: user.username,
                  displayName: user.username,
                  status: 3,
                  avatar: null
                }
              });
            }
          }
        }
        else {
          console.log(err);
        }
      });

      console.log(username + " has joined the chat room with socketId : " + socket.id);
    }

    // This is the user's unique ID to be used on ng-chat as the connected user.
    socket.emit("generatedUserId", socket.id);

    socket.broadcast.emit("friendsListChanged", usersCollection);

    // On disconnect remove this socket client from the users collection
    socket.on('disconnect', function() {
      console.log('User disconnected!' + socket.id);

      var index = usersCollection.findIndex(x => x.participant.id == socket.id);

      if(index != -1) {
        usersCollection[index].participant.status = 3; // ng-chat ChatParticipantStatus.Offline
      }

      socket.broadcast.emit("friendsListChanged", usersCollection);
    });

  });


  // On disconnect remove this socket client from the users collection
  socket.on('logout', function() {
    console.log('User disconnected!' + socket.id + " ////////////");

    var index = usersCollection.findIndex(x => x.participant.id == socket.id);

    if(index != -1) {
      usersCollection[index].participant.status = 3; // ng-chat ChatParticipantStatus.Offline
    }

    // socket.leave(socket.id);

    socket.broadcast.emit("friendsListChanged", usersCollection);

  });


  socket.on("sendMessage", function(message) {

    // Il vaut mieux parcourir la liste des users que la liste des messages
    var transmitter = usersCollection.find(x => x.participant.id == message.fromId).participant;
    var receiver = usersCollection.find(x => x.participant.id == message.toId).participant;

    io.to(message.toId).emit("messageReceived", {
      user: transmitter,
      message: message
    });

    var sql = "INSERT INTO message_socket_io (date_sent, from_id, message, to_id) VALUES (now(), '" + transmitter.displayName + "', '" + message.message + "', '" + receiver.displayName + "')";
    mysqlConnectionMessages.query(sql, (err, rows, fields) => {
        if (!err) {
            console.log("Message Added ! " + message.message + " ****");
        }
        else
            console.log(err);
    });

  });
  
});
