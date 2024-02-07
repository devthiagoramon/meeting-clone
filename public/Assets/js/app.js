var AppProcess = (() => {
  var peers_connection_ids = [];
  var peers_connection = [];
  var remote_vid_stream = [];
  var remote_aud_stream = [];
  var local_div;
  var audio;
  var isAudioMuted = true;
  var rtp_aud_sender = [];
  var video_states = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  };
  var video_st = video_states.None;
  var videoCamTrack;

  var serverProcess = null;

  async function _init(SDP_function, my_connid) {
    serverProcess = SDP_function;
    my_connection_id = my_connid;
    eventProcess();
    local_div = document.getElementById("localVideoPlayer");
  }

  function eventProcess() {
    $("#micMutUnMute").on("click", async () => {
      if (!audio) {
        await loadAudio();
      }
      if (!audio) {
        alert("Audio permission hasn't granted");
        return;
      }
      if (isAudioMuted) {
        audio.enabled = true;
        $(this).html("<span class='material-icons'>mic</span>");
        updateMediaSender(audio, rtp_aud_sender);
      } else {
        audio.enabled = false;
        $(this).html("<span class='material-icons'>mic-off</span>");
        removeMediaSender(rtp_aud_sender);
      }
      isAudioMuted = !isAudioMuted;
    });
    $("#videoCamOnOff").on("click", async () => {
      if (video_st == video_states.Camera) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.Camera);
      }
    });
    $("#ScreenShareOnOff").on("click", async () => {
      if (video_st == video_states.ScreenShare) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.ScreenShare);
      }
    });
  }
  async function videoProcess(newVideoState) {
    try {
      var vstream = null;
      if (newVideoState === video_states.Camera) {
        vstream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
      } else if (newVideoState === video_states.ScreenShare) {
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
      }
      if (vstream && vstream.getVideoTracks().length > 0) {
        videoCamTrack = vstream.getVideoTracks()[0];
        if (videoCamTrack) {
          local_div.srcObject = new MediaStream([videoCamTrack]);
          alert("Video cam found");
        }
      }
    } catch (error) {
      console.log(error);
      return;
    }
    video_st = newVideoState;
  }

  var iceConfiguration = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
      {
        urls: "stun:stun1.l.google.com:19302",
      },
    ],
  };

  async function setConnection(connId) {
    var connection = new RTCPeerConnection(iceConfiguration);
    connection.onnegotiationneeded = async (event) => {
      await setOffer(connId);
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        serverProcess(
          JSON.stringify({ icecandidate: event.candidate }),
          connId
        );
      }
    };
    connection.ontrack = (event) => {
      if (!remote_vid_stream[connId]) {
        remote_vid_stream[connId] = new MediaStream();
      }
      if (!remote_aud_stream[connId]) {
        remote_aud_stream[connId] = new MediaStream();
      }

      if (event.track.kind == "video") {
        remote_vid_stream[connId].getVideoTracks().forEach((t) => {
          remote_vid_stream[connId].removeTrack(t);
        });
        remote_vid_stream[connId].addTrack(event.track);
        var remote_video_player = document.getElementById("v_" + connId);
        remote_video_player.srcObject = null;
        remote_video_player.srcObject = remote_vid_stream[connId];
        remote_video_player.load();
      } else if (event.track.kind == "audio") {
        remote_aud_stream[connId].getAudioTracks().forEach((t) => {
          remote_aud_stream[connId].removeTrack(t);
        });
        remote_aud_stream[connId].addTrack(event.track);
        var remote_audio_player = document.getElementById("a_" + connId);
        remote_audio_player.srcObject = null;
        remote_audio_player.srcObject = remote_aud_stream[connId];
        remote_audio_player.load();
      }
    };
    peers_connection_ids[connId] = connId;
    peers_connection[connId] = connection;
    return connection;
  }

  async function setOffer(connId) {
    var connection = peers_connection[connId];
    var offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    serverProcess(
      JSON.stringify({ offer: connection.localDescription }),
      connId
    );
  }

  async function SDPProcess(message, from_connId) {
    message = JSON.parse(message);
    if (message.answer) {
      await peers_connection[from_connId].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    } else if (message.offer) {
      if (!peers_connection[from_connId]) {
        await setConnection(from_connId);
      }
      await peers_connection[from_connId].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );
      var answer = await peers_connection[from_connId].createAnswer();
      await peers_connection[from_connId].setLocalDescription(answer);
      serverProcess(
        JSON.stringify({
          answer: answer,
        }),
        from_connId
      );
    } else if (message.icecandidate) {
      if (!peers_connection[from_connId]) {
        await setConnection(from_connId);
      }
      try {
        await peers_connection[from_connId].addIceCandidate(
          message.icecandidate
        );
      } catch (error) {
        console.log(error);
      }
    }
  }

  return {
    setNewConnection: async (connId) => await setConnection(connId),
    init: async (SDP_function, my_connid) =>
      await _init(SDP_function, my_connid),
    processClientFunction: async (data, from_connId) => {
      await SDPProcess(data, from_connId);
    },
  };
})();

var MyApp = (function () {
  var socket = null;
  var user_id = "";
  var mett_id = "";

  function init(uid, mid) {
    user_id = uid;
    mett_id = mid;
    event_process_for_signaling_server();
    $("#meetingContainer").show();
    $("#me.h2").text(user_id);
  }

  function event_process_for_signaling_server() {
    socket = io.connect();

    var SDP_function = (data, to_connId) => {
      socket.emit("SDPProcess", {
        message: data,
        to_connId,
      });
    };
    socket.on("connect", () => {
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id);
        if (user_id !== "" && mett_id !== "") {
          console.log();
          socket.emit("userconnect", {
            displayName: user_id,
            meeting_id: mett_id,
          });
        }
      }
    });

    socket.on("inform_connection", (data) => {
      addUser(data.other_user.id, data.connId);
      AppProcess.setNewConnection(data.connId);
    });
    socket.on("inform_me_about_other_user", (other_users) => {
      if (other_users) {
        other_users.forEach((other_user) => {
          addUser(other_user.user_id, other_user.connectionId);
          AppProcess.setNewConnection(other_user.connectionId);
        });
      }
    });
    socket.on("SDPProcess", async (data) => {
      await AppProcess.processClientFunction(data.message, data.from_connId);
    });
  }

  function addUser(user_id, conn_id) {
    var newDivId = $("#otherTemplate").clone();
    newDivId = newDivId.attr("id", conn_id).addClass("other");
    newDivId.find("h2").text(user_id);
    newDivId.find("video").attr("id", "v_" + conn_id);
    newDivId.find("audio").attr("id", "a_" + conn_id);
    newDivId.show();
    $("#divUsers").append(newDivId);
  }

  return {
    _init: function (uid, mid) {
      init(uid, mid);
    },
  };
})();
