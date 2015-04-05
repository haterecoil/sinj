//récupérer la liste des parties en cours
socket.emit("getList");

//2 variables globales pour gérer le mot en cours, et savori si c'est notre tour de jouer
var word = "";
var myTurn = false;
var myId = null;

//handle : première view, formulaire de pseudo
$("#nickname-form").submit(function(){
	if (this[0].value <= 0){
		$("#pseudo-error").html("erreur de pseudo");
	}
	else {
		$(this).toggleClass("hidden");
		$("#rooms-listing").toggleClass("hidden");
	}
})

//Event pour la création d'une room
//	vérification du formulaire
//	envoi au serveur
$("#rc-form").submit(function(){

	if (this[0].value <= 0) {
		$("#rc-errors").html("Pas de roomname");
		return false;
	} else if (this[2].value <= 0){
		$("#rc-errors").html("Pas de max player");
		return false;
	}

	var res = {};

	res.action = "create";
	res.roomName = this[0].value;
	res.password = this[1].value;
	res.maxPlayers = this[2].value;
	res.nickname = $("#nickname").val();

	socket.emit('joinRoom', res)
});


//Event lorsqu'on joue une lettre
//récupère la lettre, envoie au serveur et déclare que l'on a joué
$("#gc-play").submit(function(){
			
	socket.emit("myLetterIs", {letter : this[0].value});
	
	this[0].value = "";

	myTurn = false;
	isItMyTurn();
});

//déclarer que l'on passe, envoie "false" au lieu d'une lettre
$("#gc-pass-form").submit(function(){
	socket.emit("myLetterIs", {letter : false});

	myTurn = false;
	isItMyTurn();
});



//liste les rooms accessibles
//
//récupère un tableau du serveur, 
//	le formate
//	ajoute l'event listener "join"
socket.on("list", function(rooms){

	//console.log(rooms);
	if (rooms.length == 0) {
		$('#rooms').html('<p> Pas de salon pour l\'instant, n\'hésitez pas à en créer un !</p>');
	}
	else {
		$('#rooms').html('');
		for (var i = 0; i < rooms.length; i++){
			$("#rooms").append('<li class="room">\
						<div class="room-name">'+rooms[i].roomName+'</div>\
						<div class="room-info">'+rooms[i].players+' / '+
												rooms[i].maxPlayers+'</div> \
						<a class="room-join" data-roomname='+rooms[i].roomName+
						' >Rejoindre</a>\
					</li></br>' );
		}
	}
	$('.room-join').click(function(e){
				
		var res = {};
		res.action = "join";
		res.password = "";
		res.nickname = $("#nickname").val();
		res.roomName = e.target.dataset.roomname;
		socket.emit("joinRoom", res);
	})
});


socket.on("joinError", function(error){
	$("#rc-errors").html(error);
});

socket.on("joinSuccess", function(arg){
	console.log("join success");	
	myId = arg.myId;

	$("#rooms-listing").toggleClass("hidden");
	$("#game").toggleClass("hidden");
});


/*
 * GAME SOCKET LISTENER
 * newPlayer : 		quand un joueur rejoint une partie en attente
 * playersList : 	récupérer la liste des joueurs d'une partie
 * newLetter : 		une lettre vient d'être jouée
 * nextPlayerIs : 	savoir si c'est à nous de jouer
 * start : 			commencer une partie
*/

//reçoit un objet avec le score et le pseudo
socket.on("newPlayer", function(data){
	console.log("new player");
		console.log(data);
				
		$("#game-players")
			.append(
				'<li class="room">\
					<div class="gp-name" data-nickname='+data.nickname+'>'+data.nickname+'</div>\
					<div class="gp-score" data-nickname='+data.nickname+'>'+data.points+'</div>\
				</li>');
			
})

//update la liste des joueurs
//reçoit un tableau avec les pseudo et scores
socket.on("playersList", function(list){
	console.log("player list");
			
	$('#game-player').html('');
	for (var i = 0; i < list.length; i++){
		$("#game-players")
			.append(
				'<li class="room">\
					<div class="gp-name" data-nickname='+list[i].nickname+'>'+list[i].nickname+'</div>\
					<div class="gp-score" data-nickname='+list[i].nickname+'>'+list[i].points+'</div>\
				</li>');
	}
});


//update le game-board
//reçoit un objet avec la lettre en str
socket.on("newLetter", function(data){
	word += data.letter;
	$("#gb-word").html(word);

	$("#game-board-ul")
		.append(
			'<li class="g-stroke">\
				<div class="gs-player">'+data.player+'</div>\
				<div class="gs-letter">'+data.letter+'</div>\
			</li>'
		);
				// <div class="gs-word">'+word+'</div>\

	updateScore(data.player);
});

//reçoit un objet avec data.next un entier
socket.on("nextPlayerIs", function(data){
	if (data.next == myId){
		myTurn = true;
		isItMyTurn();
	}
});


//reçoit un objet vec le pseudo du joueur qui commence
socket.on("start", function(arg){
	if (arg.player == myId){
		console.log("mon tour");
		console.log("arg : " + arg.player +" id "+ myId);
				
		myTurn = true;
		isItMyTurn();

		alert("C'est à votre tour !");
	}
})

//met à jour le DOM
function updateScore(player){
	var div = $(".gp-score[data-nickname='"+player+"']");
	
	//debugger;
	div[0].innerHTML = parseInt(div[0].innerHTML)+1
}

/*
* 	fin de partie
 */

socket.on("completeWord", function(data){
	gameEnds("complete", data);	
});
socket.on("playerPassed", function(data){
	gameEnds("pass", data);
});
socket.on("wrongLetter", function(data){
	gameEnds("letter", data);
});

/*
*   data.player    str
* 		.letter    str
* 		.word      str
* 		.possible  obj

	Appelé lors de fin de jeu avec reason : la raison de fin de partie
							et data : les données liées
 */

function gameEnds(reason, data){
	var player = data.player;
	var result = "";
	var message = "";

	if (reason == "letter" ){
		result = " perdu ";
		message = " à cause d'une lettre en trop.";

		var possible = data.possible;
		$("#sm-possibles").prepend("<p>Autres mots possibles : </p>");
		for (var i = 0; i < possible.length; i++){
			$("#sm-possibles").append("<li>"+possible[i]+"</li>");	
		}	
	} else if (reason == "pass"){
		result = " perdu ";
		message = " car il a passé.";

		var possible = data.possible;
		$("#sm-possibles").prepend("<p>Autres mots possibles : </p>");
		for (var i = 0; i < possible.length; i++){
			$("#sm-possibles").append("<li>"+possible[i]+"</li>");	
		}
	} else if (reason == "complete") {
		result = " gagné ";
		message = " car il a écrit le mot le plus long !";
		$('#sm-definition').prepend("<p> Définition de "+data.word+".</p>")
		$('#sm-definition').load('http://www.larousse.fr/dictionnaires/francais/'+data.word+' ul.Definitions');
	}


	$('#sm-player').html(player);
	$("#sm-result").html(result);
	$('#sm-message').html(message);

	//DOM manipulation
	$("#game").toggleClass("hidden");
	$("#score").toggleClass("hidden");

}

//relance une partie
$("#score-form").submit(function(){
	$("#sf-replay").html("en attente de réponse");
	socket.emit("replay");
});


// si le replay est accepté par tous
// réinitilise le dom correspondant
// relance un début de partie

socket.on("replayAccepted", function(){
	$("#sf-replay").html("Rejouer");
	$("#game-board-ul").html("");
	$("#gb-word").html("");
	$("#score-info").html('				<p id="score-message">\
					<span id="sm-player"></span> a\
					<span id="sm-result"></span> !\
				</p>\
				<p id="sm-message">\
				</p>\
				<ul id="sm-possibles">\
				</ul>\
				<p id="sm-definition">\
				</p>')
	word="";


	$("#game").toggleClass("hidden");
	$("#score").toggleClass("hidden");
})

//toggle disabled sur l'input myLetter
function isItMyTurn(){
	if (myTurn && $("#gc-letter").attr("disabled") == "disabled" ){
		$("#gc-letter").attr("disabled", false);
		return true;
	}	else if (!myTurn && !$("#gc-letter").attr("disabled") != "disabled") {
		$("#gc-letter").attr("disabled", true);
		return false;
	}
}
