var express = require('express');
var socket = require('socket.io');
var fs = require('fs');

//server setup
var app = express();
var srv = app.listen(port = process.env.PORT || 6000, () => {
    console.log('listening on port', port);
});
var index = process.env.INDEX;

io = socket(srv);
io.on('connection', (sock) => {
    console.log('connected!',sock.id);
    //handle disconnection
    sock.on('disconnect', () => {
        console.log('SRV: user disconnected', sock.id);
        sock.disconnect(true);
    });
    //upload full file
    sock.on('file:upload:full', (serial) =>{
    });
    //upload file by parts
    sock.on('file:upload:part', (serial) =>{
        console.log('SRV RECV: file:upload:part', sock.id);
        var object = JSON.parse(serial);
        
        if(object.type == 'head'){
            sock.emit('file:upload:next:part', 'init', '');
        }
        else if(object.type == 'part'){
            console.log(object.array.length);
            var attr = {
                sli : object.slice,
                ini : fs.statSync('./'+ index)["size"],
                end : object.array.length,
                loc : index,
            };
            var buff = Buffer.from(object.array);
            fs.appendFile('./' + index, buff, (err) => {});
            if(object.slice < object.parts){
                sock.emit('file:upload:next:part', 'next', JSON.stringify(attr));
            }else if(object.slice == object.parts){
                sock.emit('file:upload:next:part', 'endt', JSON.stringify(attr));
            }
        }
    });
    //
    sock.on('file:download', (serial) => {
        console.log('SRV RECV: file:download', sock.id, serial);
        var object = JSON.parse(serial);
        fs.open('./'+object.loc, 'r', (stat, fd) => {
            var buffer = new Buffer(object.end);
            fs.read(fd, buffer, 0, object.end, object.ini, (err, num) =>{
                object.data = buffer;
                sock.emit('file:download', JSON.stringify(object));
            });
        });
    });
});

