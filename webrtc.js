const GO_BUTTON_START = "Play";
const GO_BUTTON_STOP = "Stop";

var remoteVideo = null;
var peerConnection = null;
var peerConnectionConfig = {'iceServers': []};
var localStream = null;
var wsURL = "wss://rtmpid.cloud.influxis.com/webrtc-session.json";
var wsConnection = null;
var streamInfo = {applicationName: "rtmpid_live", streamName: "", sessionId: "[empty]"};
var userData = {param1: "value1"};
var repeaterRetryCount = 0;
var newAPI = false;
var doGetAvailableStreams = false;
/*Variables that can be overridden via query string*/
var sdpURL;
var applicationName;
var streamName = getQueryVariable("id");;
var streamInfo = {applicationName: "rtmpid_live", streamName: streamName, sessionId: "[empty]"};

var autoPlay = false;
	function getQueryVariable(variable)
{
var query = window.location.search.substring(1);
var vars = query.split("&");
for (var i=0;i<vars.length;i++) {
var pair = vars[i].split("=");
if(pair[0] == variable){return pair[1];}
       }
return(false);
}
var remoteVideoBtn;// = $("#remoteVideoBtn");

function pageReady() {

  sdpURL = getURLParameter("sdpURL") !== null ? getURLParameter("sdpURL") : wsURL;
  applicationName = getURLParameter("applicationName") !== null ? getURLParameter("applicationName") : streamInfo.applicationName;
  streamName = getURLParameter("streamName") !== null ? getURLParameter("streamName") : streamInfo.streamName;

  $("#buttonGo").attr('value', GO_BUTTON_START).click();

  remoteVideo = document.getElementById('remoteVideo');

  if (navigator.mediaDevices.getUserMedia) {
    newAPI = false;
  }

  //console.log("newAPI: " + newAPI);
  remoteVideoBtn = $("#remoteVideoBtn");
  remoteVideoBtn.on('click',()=>{
    if (peerConnection == null){
      startPlay();
    }else{
      stopPlay();
      setTimeout(() => {
        startPlay();
      }, 2000);
    }
  });

  autoPlay = getURLParameter("autoPlay") !== null ? getURLParameter("autoPlay") : autoPlay;
  if(autoPlay === 'true'){
    remoteVideoBtn.hide();
    start();
	jQuery('#buttonGo').click();
  }
}

function wsConnect(url) {
  wsConnection = new WebSocket(url);
  wsConnection.binaryType = 'arraybuffer';

  wsConnection.onopen = function () {
    console.log("wsConnection.onopen");

    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = gotIceCandidate;

    if (newAPI) {
      peerConnection.ontrack = gotRemoteTrack;
    }
    else {
      peerConnection.onaddstream = gotRemoteStream;
    }

    console.log("wsURL: " + wsURL);
    if (doGetAvailableStreams) {
      sendPlayGetAvailableStreams();
    }
    else {
      sendPlayGetOffer();
    }
  }

  function sendPlayGetOffer() {
    console.log("sendPlayGetOffer: " + JSON.stringify(streamInfo));
    wsConnection.send('{"direction":"play", "command":"getOffer", "streamInfo":' + JSON.stringify(streamInfo) + ', "userData":' + JSON.stringify(userData) + '}');
  }

  function sendPlayGetAvailableStreams() {
    console.log("sendPlayGetAvailableStreams: " + JSON.stringify(streamInfo));
    wsConnection.send('{"direction":"play", "command":"getAvailableStreams", "streamInfo":' + JSON.stringify(streamInfo) + ', "userData":' + JSON.stringify(userData) + '}');
  }

  wsConnection.onmessage = function (evt) {
    console.log("wsConnection.onmessage: " + evt.data);

    var msgJSON = JSON.parse(evt.data);

    var msgStatus = Number(msgJSON['status']);
    var msgCommand = msgJSON['command'];

    console.log(msgStatus === 502);

    if (msgStatus === 514) // repeater stream not ready
    {
      repeaterRetryCount++;
      if (repeaterRetryCount < 10) {
        setTimeout(sendGetOffer, 500);
      }
      else {
        //$("#sdpDataTag").html('Live stream repeater timeout: '+streamName);
        stopPlay();
      }
      remoteVideoBtn.show();
    }

    if (msgStatus === 502 || msgStatus === 504) {
      setTimeout(() => {
        sendPlayGetOffer();
      }, 2000);
      return;
    }

    if (msgStatus !== 200) {
      remoteVideoBtn.show();
      //$("#sdpDataTag").html(msgJSON['statusDescription']);
      stopPlay();
    }
    else {
      //$("#sdpDataTag").html("");
      remoteVideoBtn.hide();

      var streamInfoResponse = msgJSON['streamInfo'];
      if (streamInfoResponse !== undefined) {
        streamInfo.sessionId = streamInfoResponse.sessionId;
      }
     //Set SDP to baseling
     var sdpData = msgJSON['sdp'];
      if (sdpData !== undefined) {
        sdpData.sdp = sdpData.sdp.replace('64C028','42e01f');
        console.log('sdp: ' + JSON.stringify(msgJSON['sdp']));

        peerConnection.setRemoteDescription(new RTCSessionDescription(msgJSON.sdp), function () {
          peerConnection.createAnswer(gotDescription, errorHandler);
        }, errorHandler);
      }

      var iceCandidates = msgJSON['iceCandidates'];
      if (iceCandidates !== undefined) {
        for (var index in iceCandidates) {
          console.log('iceCandidates: ' + JSON.stringify(iceCandidates[index]));
          peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidates[index]));
        }
      }
    }

    if ('sendResponse'.localeCompare(msgCommand) == 0) {
      if (wsConnection != null)
        wsConnection.close();
      wsConnection = null;
    }
    // now check for getAvailableResponse command to close the connection
    if ('getAvailableStreams'.localeCompare(msgCommand) == 0) {
      stopPlay();
    }
  };

  wsConnection.onclose = function () {
    console.log("wsConnection.onclose");
  };

  wsConnection.onerror = function (evt) {
    console.log("wsConnection.onerror: " + JSON.stringify(evt));

    //$("#sdpDataTag").html('WebSocket connection failed: '+wsURL);
  };
}

function getAvailableStreams() {
  doGetAvailableStreams = true;
  startPlay();
}

function startPlay() {
  repeaterRetryCount = 0;

  wsURL = sdpURL;//$('#sdpURL').val();
  streamInfo.applicationName = applicationName;//$('#applicationName').val();
  streamInfo.streamName = streamName;//$('#streamName').val();

  console.log(wsURL, streamInfo);


  console.log("startPlay: wsURL:" + wsURL + " streamInfo:" + JSON.stringify(streamInfo));

  wsConnect(wsURL);

  if (!doGetAvailableStreams) {
    $("#buttonGo").attr('value', GO_BUTTON_STOP);
  }
}

function stopPlay() {
  if (peerConnection != null)
    peerConnection.close();
  peerConnection = null;

  if (wsConnection != null)
    wsConnection.close();
  wsConnection = null;

  remoteVideo.src = ""; // this seems like a chrome bug - if set to null it will make HTTP request

  console.log("stopPlay");

  $("#buttonGo").attr('value', GO_BUTTON_START);
}

// start button clicked
function start() {
  doGetAvailableStreams = false;

  if (peerConnection == null)
    startPlay();
  else
    stopPlay();
}

function gotMessageFromServer(message) {
  var signal = JSON.parse(message.data);
  if (signal.sdp) {
    if (signal.sdp.type == 'offer') {
      console.log('sdp:offser');
      console.log(signal.sdp.sdp);
      peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp), function () {
        peerConnection.createAnswer(gotDescription, errorHandler);
      }, errorHandler);
    }
    else {
      console.log('sdp:not-offer: ' + signal.sdp.type);
    }

  }
  else if (signal.ice) {
    console.log('ice: ' + JSON.stringify(signal.ice));
    peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
  }
}

function gotIceCandidate(event) {
  if (event.candidate != null) {
  }
}

function gotDescription(description) {
  console.log('gotDescription');
  peerConnection.setLocalDescription(description, function () {
    console.log('sendAnswer');

    wsConnection.send('{"direction":"play", "command":"sendResponse", "streamInfo":' + JSON.stringify(streamInfo) + ', "sdp":' + JSON.stringify(description) + ', "userData":' + JSON.stringify(userData) + '}');

  }, function () {
    console.log('set description error')
  });
}

function gotRemoteTrack(event) {
  console.log('gotRemoteTrack: kind:' + event.track.kind + ' stream:' + event.streams[0]);
  remoteVideo.src = window.URL.createObjectURL(event.streams[0]);
}

function gotRemoteStream(event) {
  console.log('gotRemoteStream: ' + event.stream);
  remoteVideo.src = window.URL.createObjectURL(event.stream);
}

function getURLParameter(name) {
  var ret = decodeURI((RegExp(name + '=' + '(.+?)(&|$)').exec(location.search) || [, null])[1])
  return ret == 'null' ? null : ret;
};

function errorHandler(error) {
  console.log(error);
}


