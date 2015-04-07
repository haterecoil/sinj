var http = require('http'),
    fs = require('fs'),
    express = require('express'),
    debug = require('debug')('socket.io'),
    index = fs.readFileSync(__dirname + '/public_html/index.html');
  
var app = express();
app.use(express.static(__dirname + '/public_html'));
 
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

var rooms = {}; // liste parties
 
io.on('connection', function(socket){
       
    console.log('un user sauvage s\'est connecté');

    var d_RoomName;
    socket.on('getList', function (data) // demande de rafraîchissement liste parties
    {
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
                                                    roleId : 0,
                                                    points: 0
                                                }],
                                        round: 0,
                                        password: xxdata.password,
                                        word : '',
                                        replay : 0,
                                        maxPlayers : xxdata.maxPlayers
                                    };
                socket.roleId = 0;
                socket.nickname = xxdata.nickname;
                socket.roomName = d_RoomName;
                socket.emit('joinSuccess',{myId : socket.roleId});
                socket.emit('newPlayer', {
                    nickname : socket.nickname,
                    roleId : socket.roleId,
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
                                                    roleId: 0,
                                                    socket: socket, 
                                                    points: 0
                                                });

                        socket.roleId = rooms[d_RoomName].players.length-1; //donne son ID au joueur
                        rooms[d_RoomName].players[rooms[d_RoomName].players.length-1].roleId = socket.roleId;
                        socket.roomName = d_RoomName;
                        socket.nickname = xxdata.nickname;
                        socket.emit('joinSuccess',{myId : socket.roleId});  //tell clietn he joined successfully
                        socket.join(socket.roomName);   //join a socket.io room
                        socket.emit("playersList", emitGameList(d_RoomName)); //emit new player to the room
                                
                        socket.broadcast.to(socket.roomName).emit('newPlayer', 
                            { nickname : rooms[d_RoomName].players[socket.roleId].nick,
                                roleId : rooms[d_RoomName].players[socket.roleId].roleId,
                            points : rooms[d_RoomName].players[socket.roleId].points}
                        );

                    }
                    
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
            if (typeof rooms[d_RoomName] !== 'undefined')
            {
                // enlever le joueur du tableau
                for (var i = 0; i < rooms[socket.roomName].players.length; i++){
                    console.log(rooms[socket.roomName].players[i].nick);

                    if ( rooms[socket.roomName].players[i].nick == socket.nickname ){
                                                       console.log(typeof rooms);

                        rooms[socket.roomName].players.splice(i, 1);
                        console.log("user "+ socket.nickname +" deleted");
                    }
                }
                if (rooms[socket.roomName].players.length <= 0) {
                    console.log('room deleted');

                    console.log(typeof rooms);
                    console.log(rooms);

                    delete rooms[socket.roomName];
                    console.log(rooms);
                }
            }

            socket.broadcast.emit("list", emitList());
            io.to(socket.roomName).emit("playerLeft", {nickname : socket.nickname})
        });
    });

 
    socket.on('myLetterIs', function (data) { 
        /*
            If data == false    le joueur passe
                fin de partie, playerPassed
                .emit('playerPassed', data = {
                    letter,     // str : la lettre en faute
                    player,     // str : le joueur fautif
                    possible    // obj : les possibilités
                })
            If data == string
                est-ce que la lettre, une fois ajoutée au mot précédent fait un mot ?
                Oui et la partie peut continuer:
                    .emit("newLetter", data = {
                        letter,     //str : lettre à ajouter
                        player,     //str : le dernier à avoir joué
                    });
                    .emit("nextPlayerIs", data = {
                        next        //int : l'ID du joueur prochain
                    })
                Oui et la partie ne peut pas continuer : 
                    .emit("completeWord", data = {
                        word,       //str : le mot
                        player      //str : le joueur qui a gagné
                    })
                Non :
                    .emit("wrongLetter", data = {
                        letter,
                        player,
                        possible
                    })
         */
        
        console.log("[EVT] my letter is " + data.letter);
        var nextWord = rooms[socket.roomName].word+data.letter;

         if (data.letter == false){
            socket
            io.to(socket.roomName).emit('playerPassed', {player : socket.nickname,
                                        letter : data.letter,
                                        possible : getWordsStartingWith(getNodeFromString(rootNode, rooms[socket.roomName].word), rooms[socket.roomName].word)} 
            );
         }
         else if ( typeof data.letter == "string"){
            if ( wordExistsStartingWith(rootNode, nextWord) ) {  //le jeu continue
                rooms[socket.roomName].word += data.letter;
                io.to(socket.roomName).emit("newLetter", {letter : data.letter, 
                                                          player : socket.nickname,
                                                          playerRoleId : socket.roleId});

                //next player = (current + 1) % nombre de joueurs;
                var nextPlayer = (socket.roleId + 1) % rooms[socket.roomName].players.length;
                io.to(socket.roomName).emit("nextPlayerIs", { next : nextPlayer });   
            } 
            else if ( wordExists(rootNode,nextWord) ){          //mot complet
                io.to(socket.roomName).emit("completeWord", {word : nextWord, 
                                                            player : socket.nickname}
                );
            } else {                                            //mauvaise lettre
                io.to(socket.roomName).emit("wrongLetter", {letter : data.letter, 
                                                            player : socket.nickname,
                                                            possible : getWordsStartingWith(getNodeFromString(rootNode, rooms[socket.roomName].word), rooms[socket.roomName].word)}
                );
            }
         }

    });

    socket.on("replay", function(){
        rooms[socket.roomName].replay++;
        if (rooms[socket.roomName].replay == rooms[socket.roomName].players.length){
            rooms[socket.roomName].replay = 0;
            rooms[socket.roomName].word = "";
            io.to(socket.roomName).emit("replayAccepted");
            io.to(socket.roomName).emit("start", startRandomer(rooms[socket.roomName]));
        }
    })
 
 socket.on('error', function(err){
    throw new Error(err);
 });
               
});

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
            roleId : rooms[room].players[key].roleId,
            points : rooms[room].players[key].points
        })
    }

    return res;
}

function startRandomer(room){
    return { player : Math.floor(Math.random()*room.players.length)};
}


// DICO DICO START *************************************************************************

// Les noeuds ne connaissent pas la lettre qui leur est associée, seulement les associations lettre => noeud de leurs enfants.
var Node = function() {
    this.children = {}; // liste des noeuds enfants sous la forme { m: noeud, y: noeud, etc. }
    this.definition = false; // true si c'est un mot, faux sinon
}

Node.prototype.createNodeIfNotExists = function (nodeLabel) { // nodeLabel correspond à la lettre du noeud-enfant à créer
    if (typeof this.children[nodeLabel] === 'undefined')
        this.children[nodeLabel] = new Node();

    return this.children[nodeLabel]; // on renvoie le noeud enfant nouvellement créé pour faciliter le chaînage des fonctions
}

Node.prototype.addDefinition = function (def) { // permet de dire si oui ou non ce noeud constitue un mot (la définition est ensuite récupérée côté client)
    this.definition = def;
    return this;   
}

Node.prototype.getDefinition = function () {
    return this.definition;
}

Node.prototype.getChildren = function () {
    return this.children;
}

Node.prototype.getChildrenNames = function () { // récupère la liste des lettres enfants ['a', 'o', 'p', etc.]
    return Object.keys(this.children);
}

Node.prototype.getChild = function (name) { // récupère un noeud enfant particulier à partir de la lettre de l'enfant
    return (typeof this.children[name] === 'undefined') ? false : this.children[name];
}

Node.prototype.isAWord = function () {
    return (this.definition); // definition est à true si c'est un mot
}

// Fonction de déboggage permettant d'afficher la liste des mots de manière récursive, dans l'ordre alphabétique
function recursivelyPrintNodes(currentNode, currentWord) // currentWord correspond au mot formé à l'appel de cette fonction
{
    if (typeof currentNode === 'undefined') return;
    if (currentNode.isAWord()) console.log(currentWord + ' : ' +currentNode.getDefinition());
    else console.log(currentWord);

    var childrenNames = currentNode.getChildrenNames();

    for (var childrenNameIndex = 0; childrenNameIndex < childrenNames.length; childrenNameIndex++)
    { recursivelyPrintNodes(currentNode.getChild(childrenNames[childrenNameIndex]),currentWord+childrenNames[childrenNameIndex]);
    }
}

// le joueur entre la dernière lettre de "malaises"
// if (wordExistsStartingWith malaises)
//   la partie continue
// sinon (si aucun mot de peut être forém par malaises+)
//   si (malaises est un mot) ==> if isAWord(...)
//     le joueur gagne
//   sinon
//     le joueur a voulu écrire un mot/préfixe inexistant et donc perd

// Exemples pour test :
// console.log(wordExistsStartingWith(rootNode,'malaise'));
// console.log(wordExistsStartingWith(rootNode,'malaises'));

// Renvoie vrai si un mot peut être formé à partir d'une chaîne de caractères, hormis ce mot lui-même. À appeler à chaque tour.
// @param currentNode le noeud à partir duquel effectuer la recherche (utiliser rootNode pour le tout premier noeud)
function wordExistsStartingWith(currentNode,pre) // ATTENTION : si on appelle la fonction sur malaises ça va renvoyer false. (aucun mot qui commence par malaises)
{
    for (var i=0; i<pre.length;i++)
    {
        currentNode = currentNode.getChild(pre.charAt(i));
        if (currentNode === false)
            return false; // noeud enfant n'a pas été trouvé
    }
    if (currentNode.getChildrenNames().length>0) return true; // si la dernière lettre a des enfants, c'est-à-dire qu'il est possible de former un autre mot à partir de ce préfixe (par exemple "malaises" à partir de "malaise")
    return false;
}

// Permet de savoir si un mot existe à partir d'un noeud de base
function wordExists(currentNode,word)
{
    for (var i=0; i<word.length;i++)
    {
        currentNode = currentNode.getChild(word.charAt(i));
        if (currentNode === false)
            return false; // noeud enfant n'a pas été trouvé
    }
    return true;
}

// Permet de récupérer le noeud associé à une chaîne de caractères (par exemple le noeud "s" à partir du texte "malaises")
function getNodeFromString(currentNode,stringx)
{
    for (var i=0; i<stringx.length;i++)
    {
        currentNode = currentNode.getChild(stringx.charAt(i));
        if (currentNode === false)
            return false; // noeud enfant n'a pas été trouvé
    }
    return currentNode;
}

// pour que la fonction n'ait pas de dépendance externe (ne fasse pas appel à une variable extérieure à cette fonction même ou à ses arguments) ==> injection de dépendances : getWordsStartingWith(noeud du mot, mot);
// on rappelle qu'un noeud ne connaît pas la lettre qui lui est associée, et a de visible que ses noeuds enfants et les lettres associées à ses enfants
// par exemple : getWordsStartingWith(getNodeFromString(rootNode,'mala'),'mala');
function getWordsStartingWith(currentNode, currentWord)
{
    if (currentNode === false) return [];

    var words = [];
    var limit = 5;
    var recursivelyGetWordsStartingWith = function (currentNode,currentWord) // cette fonction a accès à la variable externe words qu'elle va remplir au fur et à mesure
    {
        
        if (typeof currentNode === 'undefined') return;

        if (currentNode.isAWord()) words.push(currentWord);

        if (words.length > limit) return; // pour ne pas renvoyer trop de mots

        var childrenNames = currentNode.getChildrenNames();

        for (var childrenNameIndex = 0; childrenNameIndex < childrenNames.length; childrenNameIndex++)
        {
            recursivelyGetWordsStartingWith(currentNode.getChild(childrenNames[childrenNameIndex]),currentWord+childrenNames[childrenNameIndex]);
        }
    };
    recursivelyGetWordsStartingWith(currentNode,currentWord); // premier appel à la fonction récursive
    
    return words; // on renvoie la liste des mots commençant par la chaîne de caractères
}

// (inutilisé) Méthode permettant de récupérer les noeuds, mais l'on ne peut pas connaître les lettres associées
function getNodesOfWordsStartingWith(currentNode, startingWith)
{
    if (typeof currentNode === 'undefined') return;

    var startingWithNode = getNodeFromString(currentNode,startingWith);
    if (startingWithNode === false) return []; // ou return false : aucun mot qui ne commence par ce mot

    var words = [];
    var backlog = [currentNode];
    do {
        currentNode = backlog.shift(); // file
        if (currentNode.isAWord()) words.push(currentNode);

        var childrenNames = currentNode.getChildrenNames();
        for (var childrenNameIndex = 0; childrenNameIndex < childrenNames.length; childrenNameIndex++)
        {
            backlog.push(currentNode.getChild(childrenNames[childrenNameIndex]));
        }


    } while (backlog.length>0);

    return words;
}

// Premier noeud de l'arbre
var rootNode = new Node();

var readline = require('readline'); // permet de parser le fichier de dictionnaire ligne par ligne pour construire l'arbre au fur et à mesure

var rd = readline.createInterface({
    input: fs.createReadStream('dico.txt'),
    output: process.stdout,
    terminal: false
});

var parentNodes = [{node: rootNode, letter: '!'}];

// Cette technique permet de toujours avoir un accès facile au dernier noeud commun avec le mot précédent
rd.on('line', function(word) {

    // de ROOT + abbaye (parentnodes) à abbayes
    // de ROOT + abbaye (parentnodes) à acupuncture? ==> devient ROOT + a (parentnodes)
    for (var i=1; i<parentNodes.length; i++) // on supprime les noeuds dont les lettres ne sont pas en commun entre le dernier mot parcouru et le nouveau
    {   
        if (parentNodes[i].letter !== word.charAt(i-1)) { parentNodes=parentNodes.slice(0,i); break; }
    }

    for (var letterIndex=parentNodes.length-1; letterIndex<word.length; letterIndex++) // on ajoute les noeuds des nouvelles lettres dans le tableau
    {
        parentNodes.push({node: parentNodes[parentNodes.length-1].node.createNodeIfNotExists(word.charAt(letterIndex)), letter: word.charAt(letterIndex)}); // on ajoute par exemple le "o" de "abo" dans parentNodes (qui contenait [ROOT] a b avant)   
    }

    parentNodes[parentNodes.length-1].node.addDefinition(true);
});

rd.on("close", function() { // et le reste du script...
    // recursivelyPrintNodes(rootNode, ''); <-- ne pas faire sur un gros dictionnaire
    // console.log(getWordsStartingWith(getNodeFromString(rootNode,'anticonstitutionnel'),'anticonstitutionnel'));
});
    

// DICO DICO END ***************************************************************************
 
server.listen(8080);
 
console.log('End of script. Now listening.');