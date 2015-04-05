
/*
	TODO : gérer la fin de partie (affichage d'une définition et d'un score)
			gérer la possibilité de rejouer
			gérer le retour au lobby (re-initialiser des variables et des champs)
 */
socket.emit("getList");

var word = "";
var myTurn = false;
var myId = null;

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

//Event lorsque l'on rejoint une room


//Event lorsqu'on joue une lettre
$("#gc-play").submit(function(){
			
	socket.emit("myLetterIs", {letter : this[0].value});
	
	this[0].value = "";

	myTurn = false;
	isItMyTurn();
});

$("#gc-pass-form").submit(function(){
	socket.emit("myLetterIs", {letter : false});

	myTurn = false;
	isItMyTurn();
});





//liste les rooms accessibles
socket.on("list", function(rooms){

	//console.log(rooms);
	if (rooms.length == 0) {
		$('#rooms').html('<p> Pas de salon pour l\'isntant, n\'hésitez pas à en créer un !</p>');
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
					</li>' );
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
*/

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

//signifie la fin de partie
socket.on("wrongLetter", function(data){
	gameEnds("misplay", data.letter );
});

//update le game-board
socket.on("newLetter", function(data){
	word += data.letter;

	$("#game-board-ul")
		.append(
			'<li class="g-stroke">\
				<div class="gs-player">'+data.player+'</div>\
				<div class="gs-letter">'+data.letter+'</div>\
				<div class="gs-word">'+word+'</div>\
			</li>'
		);

	updateScore(data.player);
});

socket.on("completeWord", function(data){
	console.log(data);		
});


socket.on("playerPassed", function(data){
	gameEnds("pass", data);
});

socket.on("nextPlayerIs", function(data){
	if (data.next == myId){
		myTurn = true;
		isItMyTurn();
	}
});



socket.on("start", function(arg){
	if (arg.player == myId){
		console.log("mon tour");
		console.log("arg : " + arg.player +" id "+ myId);
				
		myTurn = true;
		isItMyTurn();

		alert("C'est à votre tour !");
	}
})

function updateScore(player){
	var div = $(".gp-score[data-nickname='"+player+"']");
	
	//debugger;
	div[0].innerHTML = parseInt(div[0].innerHTML)+1
}
/*
*   data.player
* 		.letter
* 		.word
* 		.possible
 */
function gameEnds(reason, data){
	var player = data.player;
	var result = "";
	var message = "";

	if (reason == "letter" ){
		result = " perdu ";
		message = " à cause d'une lettre en trop.";

		var possible = " possible ";
		$("#sm-possibles").html(possible);
	} else if (reason == "pass"){
		result = " perdu ";
		message = " car il a passé.";

		var possible = " possible ";
		$("#sm-possibles").html(possible);	
	} else if (reason == "complete") {
		result = " gagné ";
		message = " car il a écrit le mot le plus long !";

		$('#sm-definition').load('http://www.larousse.fr/dictionnaires/francais/'+data.word+' ul.Definitions');
	}


	$('#sm-player').html(player);
	$("#sm-result").html(result);
	$('#sm-message').html(message);

	//DOM manipulation
	$("#game").toggleClass("hidden");
	$("#score").toggleClass("hidden");

}

function showScore(){
	//DOM manipulation
	$("#game").toggleClass("hidden");
	$("#score").toggleClass("hidden");

	//update score
	
	//
}

//toggle disabled on myletter input
function isItMyTurn(){
	if (myTurn && $("#gc-letter").attr("disabled") == "disabled" ){
		$("#gc-letter").attr("disabled", false);
		return true;
	}	else if (!myTurn && !$("#gc-letter").attr("disabled") != "disabled") {
		$("#gc-letter").attr("disabled", true);
		return false;
	}
}


/*
	Accueil
	Création de la liste des parties
		Requête
		Affichage

	Rejoindre une partie
		Requête
		Affichage

	Créer une partie
		Vérification
		Requête

 */

//connect au socket

//Liste des parties.

