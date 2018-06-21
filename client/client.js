const express = require('express');
const socket = require('socket.io-client');
const request = require('request');
const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require('fs');

// electron setup
const {app, BrowserWindow, ipcMain} = electron;

var server = socket.connect('http://127.0.0.1:3000');

server.on('disconnect', () => {
    console.log('CLI: disconnected');
});
// recv from server: peer
var list = [];
var name;
var size;

server.on('file:download', (n, s) => {
    list = [];
    name = n;
    size = s;
});

server.on('file:download:part', (serial) => {
    console.log('RECV: file:download:part');
    var object = JSON.parse(serial);
    list[object.sli] = new Buffer.from(object.data);
});

server.on('file:download:endt', (serial) =>{
    console.log('RECV: file:download:endt', name, size);
    var object = JSON.parse(serial);
    list[object.sli] = new Buffer.from(object.data);
    var buffer = Buffer.concat(list, size);
    fs.writeFile('./recv_'+name, buffer, (err) => { });
});

// electorn
let Mainwindow; 
// electron ready event

app.on('ready', () => {
    //constructor
    Mainwindow = new BrowserWindow({width: 640, height: 480});
    //load html in window
    Mainwindow.loadURL(url.format({
        pathname: path.join(__dirname, 'main.html'),
        protocol: 'file:',
        slashes: true
    }));
});

//electron: from UI: recv listfiles
ipcMain.on('file:list', (evt) => {
    console.log('IPCS RECV: file:list');
    server.emit('file:list');
    server.on('file:list', (serial) => {
        console.log('SRV RECV: file:list');
        var object = JSON.parse(serial);
        Mainwindow.webContents.send('file:list');
    });
});

//electron: from UI: send filenames
ipcMain.on('file:send', (evt, serial) => {
    var object = JSON.parse(serial);
    console.log('IPCS RECV: file:send ', serial);
    fs.readFile(object.path, (err, data) => {
        object.data = Array.prototype.slice.call(data, 0);
        if(object.size <= 65535){
            var send = {
                name : object.name,
                size : object.data.length,
                parts : 0,
                slice : 0,
                array : object.data,
            };
            console.log(send.parts, send.slice, send.size, send.array.length);
            server.emit('file:upload:full', JSON.stringify(send));
        }else{
            var d = Math.round(object.size / 65535);
            var r = object.size % 65535;
            server.emit('file:upload:part', object.name, object.size);
            var i=0, j=1;
            server.on('file:upload:next:part', () => {
                console.log('SRV RECV: file:upload:next:part');
                var s = (j * 65535) > object.size ? object.size : (j * 65535);
                var send = {
                    type : 'part',
                    parts : d,
                    slice : i, 
                    array : object.data.slice(i * 65535, s),
                };
                console.log(send.parts, send.slice, send.array.length);
                server.emit('file:next', JSON.stringify(send));
                i++;j++;
            });
        }
    });
});

//electron: from UI: recv filenames
ipcMain.on('file:recv', (evt, name) => {
    console.log('IPCS RECV: file:recv', name);
    server.emit('file:download', name);
});

//electron: from UI: recv deletefile
ipcMain.on('file:supr', (evt, names) => {
    console.log('electron recv: delt:file', names);
    server.emit('sock:delf', names);
});