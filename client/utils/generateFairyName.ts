const FAIRY_NAMES = [
	"Sniper's Dream",
	'The Lord of Crisps',
	'Chairman Meow',
	'Sgt. Biscuits',
	'Dave the Sponge',
	'The Reverend Flange',
	'Knickknack Paddywhack',
	'Colonel Bogwash',
	'Mavis Beacon of Hope',
	'Professor Crumpet',
	'Councillor Nutkins',
	'The Right Honourable Stinks',
	'Mr. Saucy Giblets',
	'Barrington Spoonface',
	'Inspector Carpet',
	'Commodore Flaps',
	'Sir Lunchbox III',
	'Mrs. Tablecloth',
	'Brigadier Sandwich',
	'Captain Nonsense',
	'The Archbishop of Bants',
	'Dr. Chickenpox',
	'Sergeant Fluffington',
	'The Duke of Puddles',
	'Vicar of Dibley 2',
]

export function generateFairyName() {
	const index = Math.floor(Math.random() * FAIRY_NAMES.length)
	return FAIRY_NAMES[index]
}
