import { MessageAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * Replace em dashes and en dashes with a comma, and strip double hyphens, so
 * no bee ever renders a dash the model reached for. Applied to all message
 * text since bees speak only through message actions.
 */
export function stripEmDashes(text: string): string {
	return text.replace(/\s*[—–]\s*/g, ', ').replace(/\s*--\s*/g, ', ')
}

/**
 * Strip coordinate references, pixel values, and shape IDs from message text.
 * Bee messages are user-facing banter; technical narration belongs in actions.
 */
export function stripCoordinates(text: string): string {
	return text
		.replace(/\(?\s*[xy]:\s*-?\d+[\s,]*[xy]?:?\s*-?\d+\s*\)?/gi, '')
		.replace(/\b\d+px\b/gi, '')
		.replace(/\b(shape|id)[_-]?[a-z0-9]{6,}\b/gi, '')
		.replace(/\s{2,}/g, ' ')
		.trim()
}

/**
 * American -> British spellings for the words that actually turn up in the
 * bees' drawing commentary. A curated whole-word map, not suffix regex, so
 * common words like "size" or "her" are never mangled. Keys must be lower
 * case; casing of the original word (all-caps or capitalised first letter) is
 * preserved on replacement.
 */
const BRITISH_SPELLINGS: Record<string, string> = {
	color: 'colour',
	colors: 'colours',
	colored: 'coloured',
	coloring: 'colouring',
	colorful: 'colourful',
	discolored: 'discoloured',
	center: 'centre',
	centers: 'centres',
	centered: 'centred',
	centering: 'centring',
	gray: 'grey',
	grayish: 'greyish',
	favorite: 'favourite',
	favorites: 'favourites',
	favor: 'favour',
	neighbor: 'neighbour',
	neighbors: 'neighbours',
	neighboring: 'neighbouring',
	organize: 'organise',
	organized: 'organised',
	organizing: 'organising',
	recognize: 'recognise',
	recognized: 'recognised',
	realize: 'realise',
	realized: 'realised',
	meter: 'metre',
	meters: 'metres',
	liter: 'litre',
	liters: 'litres',
	traveled: 'travelled',
	traveling: 'travelling',
	canceled: 'cancelled',
	labeled: 'labelled',
	labeling: 'labelling',
	mustache: 'moustache',
}

/** Re-apply the casing pattern of `original` (ALL CAPS or Capitalised) to `replacement`. */
function matchCase(original: string, replacement: string): string {
	if (original === original.toUpperCase()) return replacement.toUpperCase()
	if (original[0] === original[0].toUpperCase()) {
		return replacement[0].toUpperCase() + replacement.slice(1)
	}
	return replacement
}

/**
 * Convert American spellings to British in message text, so every bee speaks
 * the Queen's English regardless of what the model produced. Whole-word,
 * case-preserving; leaves any word not in the map untouched.
 */
export function britishiseSpelling(text: string): string {
	return text.replace(/[A-Za-z]+/g, (word) => {
		const british = BRITISH_SPELLINGS[word.toLowerCase()]
		return british ? matchCase(word, british) : word
	})
}

export const MessageActionUtil = registerActionUtil(
	class MessageActionUtil extends AgentActionUtil<MessageAction> {
		static override type = 'message' as const

		override getInfo(action: Streaming<MessageAction>) {
			return {
				description: action.text ?? '',
				canGroup: () => false,
			}
		}

		override sanitizeAction(action: Streaming<MessageAction>, _helpers: AgentHelpers) {
			// An Executor only gets to speak once, on the turn it's dispatched. Its
			// dispatch prompts come from the Planner or the coordinator (source
			// 'other-agent'); every later turn in the same dispatch (claiming the
			// next item, navigating, being told to keep drawing) is scheduled by the
			// Executor itself (source 'self'). The model would otherwise stay in
			// character and re-narrate, often verbatim, on each of those self turns.
			// Rejecting message actions on self-sourced Executor turns stops that at
			// one chokepoint instead of chasing every continuation prompt. The
			// Planner is unaffected: it legitimately messages on its own self-sourced
			// review rounds.
			if (this.agent.role === 'executor' && this.agent.requests.getActiveRequest()?.source === 'self') {
				return null
			}

			if (typeof action.text === 'string') {
				return { ...action, text: britishiseSpelling(stripEmDashes(stripCoordinates(action.text))) }
			}
			return action
		}
	}
)
