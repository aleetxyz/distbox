const express = require('express');
const socket = require('socket.io');
const client = require('socket.io-client');
var fs = require('fs');

//server setup
var app = express();
var srv = app.listen(port = process.env.PORT || 8181, () => {
    console.log('listening on port', port);
})

//websocket setup
var server = socket(srv);

var workers = []
workers.push(client.connect('http://127.0.0.1:4000'));
workers.push(client.connect('http://127.0.0.1:4001'));
workers.push(client.connect('http://127.0.0.1:4002'));

var mirrors = []
mirrors.push(client.connect('http://127.0.0.1:5000'));
mirrors.push(client.connect('http://127.0.0.1:5001'));
mirrors.push(client.connect('http://127.0.0.1:5002'));

server.on('connection', (client) => {
    console.log('connected!',client.id);
    var r = 0;
    //handle disconnection
    client.on('disconnect', () => {
        console.log('SRV: user disconnected', client.id);
        client.disconnect(true);
    });
    //hndle list message
    client.on('file:list', () => {   
        console.log('CLI RECV: file:list');
        var list = [];
        fs.readFile('./reldb', 'utf-8', (err, data) =>{
            var lines = data.split('\n');
            lines.forEach(element => {
                if(element.length > 0){
                    var object = JSON.parse(element);
                    list.push(object.name);
                }
            });
            client.emit('file:list', JSON.stringify(list));
        });
    });
    //receive full file from client
    client.on('file:upload:full', (serial) => {
        console.log('RECV: file:upload:full', client.id);
        workers[r].emit('file:upload:full', serial);
        r = (r+1) % 3;
    });
    //receive part file from client
    client.on('file:upload:part', (name, size) => {
        console.log('CLI RECV: file:upload:part');

        var attrs = {
            name : name,
            size : size,
            attr : [],
        }

        workers[r].emit('file:upload:part', JSON.stringify({type:'head'}));

        workers.forEach(worker => {
            worker.on('file:upload:next:part', (type, attr) =>{
                console.log('WRK RECV: file:upload:next:part', type, attr);
                if(type == 'init'){ 
                    client.emit('file:upload:next:part');
                }else if(type == 'next'){
                    attrs.attr.push(JSON.parse(attr));
                    client.emit('file:upload:next:part');
                }else if(type == 'endt'){
                    attrs.attr.push(JSON.parse(attr));
                    fs.appendFile('./reldb', JSON.stringify(attrs) + '\n', 'utf-8', (err) => {});
                }
            });    
        });

        client.on('file:next', (serial) =>{
            console.log('CLI RECV: file:next',);
            workers[r].emit('file:upload:part', serial);            
            r = (r+1) % 3;
        });
       
    });
    //file send to client
    var size = 0;
    var attr = {};
    client.on('file:download', (name) => {
        console.log('CLI RECV: file:download', client.id);
        attr = seekFile(name);
        size = 0;
        client.emit('file:download', attr.name, attr.size);

        for(var i=0; i<attr.attr.length; i++){
            //workers[r].emit('file:download', JSON.stringify(packet));
            delaysend(workers[r], 'file:download', attr.attr[i]);
            r = (r+1) % 3;
        }
    });

    function delaysend(worker, order, content){
        setTimeout(() => {
            worker.emit(order, JSON.stringify(content));
        }, 1000);
    }

    workers.forEach(worker => {
        worker.on('file:download', (serial) => {
            console.log('WRK SRV: file:download');
            var object = JSON.parse(serial);
            size = size + object.end;
            if (size < attr.size){
                client.emit('file:download:part', serial);
            }else if(size == attr.size){
                client.emit('file:download:endt', serial);
            }
        });
    });
    //file delete
    client.on('file:delete', (name) => {
        console.log('CLI RECV: file:delete', client.id);
        //var attr = seekFile(name);
    });
});

function seekFile(name){
    var attr = new Object();
    var data = fs.readFileSync('./reldb', 'utf-8')
    var lines = data.split('\n');
    for (let i=0; i<lines.length; i++){
        attr = JSON.parse(lines[i]);
        if(attr.name == name){
            break;
        }
    }
    return attr;
}

function delfAttr(name){ 
    var attr = new Object();
    var data = fs.readFileSync('./reldb', 'utf-8')
    var lines = data.split('\n');
    for (let i=0; i<lines.length; i++){
        attr = JSON.parse(lines[i]);
        if(attr.name == name){
            lines[i] = '';
        }
    }
    return attr;
}

workers.forEach(worker =>{
    worker.on('disconnect', () => {
        var i = workers.indexOf(worker);
        console.log('disconnected', i);
        var tmp = workers[i]
        workers[i] = mirrors[i];
        mirrors[i] = tmp;
    });
    worker.on('reconnect_attempt', (atn) => {
        console.log('worker reconnect attempt', atn); 
    });
    worker.on('reconnect', () =>{
        var i =  mirrors.indexOf(worker);
        console.log('reconnected', i);
        var tmp = mirrors[i]
        mirrors[i] = workers[i];
        workers[i] = tmp;
    });
});

mirrors.forEach(mirror =>{
    mirror.on('disconnect', () =>{
        var i = workers.indexOf(worker);
        console.log('disconnected', i);
        var tmp = workers[i]
        workers[i] = mirrors[i];
        mirrors[i] = tmp;
    });
    mirror.on('reconnect_attempt', (atn) => {
        console.log('mirror reconnect attempt', atn); 
    });
});


