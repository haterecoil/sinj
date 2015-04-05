/*
*   TODO : gérer la fin de partie (
                verif dictionnaire
                + afficahge définition
                )
*
*   TODO pour gagner des poiints : 
*       Pouvoir ajouter ses mots (stockage local 
    storage sur la machine de celui qui a ajouté des mots)

*           
 */

var http = require('http'),
    fs = require('fs'),
    express = require('express'),
    debug = require('debug')('socket.io'),
    index = fs.readFileSync(__dirname + '/public_html/index.html');
 
  
var app = express();
app.use(express.static(__dirname + '/public_html'));
 
// Import des scripts JS partagés client/serveur
// eval(fs.readFileSync('js/toolbox.js')+'');
// eval(fs.readFileSync('js/labyHalf.class.js')+'');
 
 
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

var rooms = {}; // liste parties
 
io.on('connection', function(socket){
       
       console.log('un user sauvage s\'est connecté');
               

    var d_RoomName;
    socket.on('getList', function (data) // demande de rafraîchissement liste parties
    {
        console.log('ROOMS :');
        console.log(rooms);
       
        var ret = [];
        for (var key in rooms) // on renvoie toutes les parties non pleines
        {
            ret.push({
                roomName: key,
                players: rooms[key].players.length,
                maxPlayers : rooms[key].maxPlayers,
                protected: (rooms[key].password !== '')
            });
        }
       
        socket.emit('list',ret);
    });
 
   
    socket.on('myRoleId', function (data)   { 
        socket.roleId = data; if (data==0) socket.otherRoleId = 1; else socket.otherRoleId = 0; 
    });

    socket.on('joinRoom', function (xxdata) {
        d_RoomName=xxdata.roomName;
        console.log('join room name : '+ d_RoomName);
        console.log(xxdata);
                
               
        /*
        Si créer
            Si existe pas
                créer
            sinon si existe
                                erreur
        Sinon si joindre
            Si existe
                joindre
            Sinon
                erreur
        */
       
        if (xxdata.action=='create') // si créer
        {
            if (!(d_RoomName in rooms)) // la room n'existe pas, on la crée
            {
                
                rooms[d_RoomName] = {   
                                        players:  [
                                                { nick: xxdata.nickname, 
                                                    socket: socket, 
                                                    points: 0
                                                }],
                                        round: 0,
                                        password: xxdata.password,
                                        maxPlayers : xxdata.maxPlayers
                                    };
                socket.roleId = 0;
                socket.nickname = xxdata.nickname;
                socket.otherRoleId = 1;
                socket.roomName = d_RoomName;
                socket.emit('joinSuccess',{myId : socket.roleId});
                socket.emit('newPlayer', {
                    nickname : socket.nickname,
                    points : 0
                })
                socket.join(socket.roomName);
                        
            }
            else // elle existe (user a tenté de créer serveur qui a le même nom qu'un autre)
            {
                socket.emit('joinError','Ce nom de serveur est déjà utilisé.');
                return;
            }
        }
        else // si joindre
        {
            if (d_RoomName in rooms) // on essaie de joindre une room qui existe, bien
            {
                if (d_RoomName in rooms && rooms[d_RoomName].players.length>=rooms[d_RoomName].maxPlayers) // erreur
                {
                    socket.emit('joinError','Le serveur est complet.');
                    return;
                }
                else // on complète
                {
                    if (xxdata.password != rooms[d_RoomName].password)
                    {
                        socket.emit('joinError','Mot de passe incorrect.');
                        return;
                    }
                    else
                    {
                        rooms[d_RoomName].players.push(
                                                { nick: xxdata.nickname, 
                                                    socket: socket, 
                                                    points: 0
                                                });

                        socket.roleId = rooms[d_RoomName].players.length-1; //donne son ID au joueur
                        socket.roomName = d_RoomName;
                        socket.nickname = xxdata.nickname;
                        socket.emit('joinSuccess',{myId : socket.roleId});  //tell clietn he joined successfully
                        socket.join(socket.roomName);   //join a socket.io room
                        //emit new player to the room
                        socket.emit("playersList", emitGameList(d_RoomName));

                        console.log("broad room");
                                
                        socket.broadcast.to(socket.roomName).emit('newPlayer', 
                            { nickname : rooms[d_RoomName].players[socket.roleId].nick,
                            points : rooms[d_RoomName].players[socket.roleId].points}
                        );

                        console.log(emitGameList(d_RoomName));
                    }
                    //console.log(io.to(d_RoomName));
                            
                    if (rooms[d_RoomName].maxPlayers == rooms[d_RoomName].players.length){
                        io.to(d_RoomName).emit("start", startRandomer(rooms[d_RoomName]));
                    }
                }
            }
            else
            {
                    socket.emit('joinError','Le serveur n\'existe plus.');
                    return;  
            }
        }               

        socket.broadcast.emit("list", emitList());


        socket.on('disconnect', function (data) { // si un joueur se déconnecte, on déconnecte l'autre joueur aussi
            console.log(d_RoomName + ' ! on disconnect');
            console.log(rooms[socket.roomName]);
                    
                    
                        if (typeof rooms[d_RoomName] !== 'undefined')
                        {
                            //virer le gars du tableau
                            for (var i = 0; i < rooms[socket.roomName].players.length; i++){
                                console.log(rooms[socket.roomName].players[i].nick);
                                        
                                if ( rooms[socket.roomName].players[i].nick == socket.nickname ){
                                                                   console.log(typeof rooms);

                                    rooms[socket.roomName].players.splice(i, 1);
                                    console.log("user "+ socket.nickname +" deleted");
                                }
                            }
                            if (rooms[socket.roomName].players.length <= 0){
                                console.log('room deleted');
                                      
                                console.log(typeof rooms);
                                console.log(rooms);
                                            
                                delete rooms[socket.roomName];
                                console.log(rooms);
                                        
                                //rooms.splice(rooms.indexOf(socket.roomName), 1);

                            }
                        }
            // console.log('deleting room...')
            //             delete rooms[d_RoomName];
            // console.log('after deletion :');
            // console.log(rooms);
            socket.broadcast.emit("list", emitList());
            io.to(socket.roomName).emit("playerLeft", {nickname : socket.nickname})
        });
    });

 
    socket.on('myLetterIs', function (data) { 
        /*
            If data == false    le jouer passe
                fin de partie
            If data == string
                est-ce que la lettre, une fois ajoutée au mot précédent fait un mot ?
                Oui :
                    .emit("newLetter", lettre);
                Non :
                    .emit("wrongLetter", {lettre, player})
         */

         if (data.letter == false){
            socket.emit('playerPassed', {nickname : socket.nickname} );
         }
         else if ( typeof data.letter == "string"){
            //if ( letterEndsGame(data.letter) ){
            if (false) {
                io.to(socket.roomName).emit("wrongLetter", {letter : data.letter});
            }
            else {
                io.to(socket.roomName).emit("newLetter", {letter : data.letter, player : socket.nickname});
                //next player = (current + 1) % nombre de joueurs;
                var nextPlayer = (socket.roleId + 1) % rooms[socket.roomName].players.length;
                io.to(socket.roomName).emit("nextPlayerIs", { next : nextPlayer });
            }
         }

    });
 
 socket.on('error', function(err){
    throw new Error(err);
 });
               
});

//vérifie si après (le mot actuel + la lettre entrée) le dictionnaire continue
function letterEndsGame(letter){
    //check


    //return true / false
}

function emitList(){
            //après l'event join, on broadcast la nouvelle list des rooms     
        var ret = [];
        for (var key in rooms) // on renvoie toutes les parties non pleines
        {
            ret.push({
                roomName: key,
                players: rooms[key].players.length,
                maxPlayers : rooms[key].maxPlayers,
                protected: (rooms[key].password !== '')
            });
        }
                console.log("EMIT list " + ret);  

        return ret;
}

function emitGameList(room){
    var res = [];

    for (var key in rooms[room].players){
        res.push({
            nickname : rooms[room].players[key].nick,
            points : rooms[room].players[key].points
        })
    }

    return res;
}

function startRandomer(room){
                return { player : Math.floor(Math.random()*room.players.length)};
}

var Dictionnaire = {
}
 
server.listen(8080);
 
console.log('End of script. Now listening.');