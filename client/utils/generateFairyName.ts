const FAIRY_NAMES = [
	'Dick Cindersmith',
	'Bonnie Kettlewick',
	'Grog Fernsby',
	'Mavis Bramblehook',
	'Clive Honeyfern',
	'Poppy Rattletwig',
	'Edgar Mosswhistle',
	'Nellie Cobblefizz',
	'Basil Wispendale',
	'Dotty Crumblebrook',
	'Oswald Petalprick',
	'Queenie Nettleby',
	'Rupert Dapplethorn',
	'Fiona Bumbletuck',
	'Cedric Toadflax',
	'Minnie Puddlewick',
	'Horace Thimblefern',
	'Pearl Snickerroot',
	'Wally Bumblebrass',
	'Agnes Feathergleam',
	'Stanley Picklethorp',
	'Betty Glowbranch',
	'Nigel Acornsnap',
	'Doris Fizzlefern',
	'Tilly Thistledown',
]

export function generateFairyName() {
	const index = Math.floor(Math.random() * FAIRY_NAMES.length)
	return FAIRY_NAMES[index]
}
