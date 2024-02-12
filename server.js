const express = require("express");
const path = require("path");
const app = express();

var server = app.listen(3000, () => [console.log("Listening in 3000")]);

const io = require("socket.io")(server);

app.use(express.static(path.join(__dirname, "")));

var userConnections = [];

io.on("connection", (socket) => {
  socket.on("userconnect", (obj) => {
    console.log("userconnect", obj.displayName, obj.meeting_id);
    var other_users = userConnections.filter(
      (p) => p.meeting_id === obj.meeting_id
    );

    userConnections.push({
      connectionId: socket.id,
      user_id: obj.displayName,
      meeting_id: obj.meeting_id,
    });

    other_users.forEach((v) => {
      socket.to(v.connectionId).emit("inform_connection", {
        other_users_id: obj.displayName,
        connId: socket.id,
      });
    });
    socket.emit("inform_me_about_other_user", other_users);
  });
  socket.on("SDPProcess", (data) => {
    socket.to(data.to_connId).emit("SDPProcess", {
      message: data.message,
      from_connId: socket.id,
    });
  });
  socket.on("disconnect", () => {
    console.log("USER GOT DISCONNECTED");
    var disconnectedUser = userConnections.find(
      (p) => p.connectionId === socket.id
    );

    if (disconnectedUser) {
      var meetingId = disconnectedUser.meeting_id;
      userConnections = userConnections.filter(
        (p) => p.connectionId !== socket.id
      );
      var list = userConnections.filter((p) => p.meeting_id === meetingId);
      console.log(disconnectedUser);
      list.forEach((v) => {
        socket.to(v.connectionId).emit("inform_other_about_disconnected_user", {
          connId: socket.id,
        });
      });
    }
  });
});
