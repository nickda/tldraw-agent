/**
 * JSON helper. Given a potentially incomplete JSON string, return the parsed object.
 * The string might be missing closing braces, brackets, or other characters like quotation marks.
 * @param string - The string to parse.
 * @returns The parsed object.
 */
export function closeAndParseJson(string: string) {
	// Strip any non-JSON preamble (model may emit thinking text before the JSON
	// when assistant prefill is disabled, e.g. on Bedrock). The preamble itself
	// may contain a literal '{' (e.g. prose like "use { as an example"), so try
	// every '{' in order and use the first one that actually parses, rather than
	// assuming the first '{' in the buffer starts the real JSON.
	let searchFrom = 0
	while (true) {
		const jsonStart = string.indexOf('{', searchFrom)
		if (jsonStart === -1) return null
		const result = parseFromOpeningBrace(string.slice(jsonStart))
		if (result !== null) return result
		searchFrom = jsonStart + 1
	}
}

function parseFromOpeningBrace(string: string) {
	const stackOfOpenings = []

	// Track openings and closings
	let i = 0
	while (i < string.length) {
		const char = string[i]
		const lastOpening = stackOfOpenings.at(-1)

		if (char === '"') {
			// Check if this quote is escaped. Count consecutive backslashes
			// immediately before it: an odd count means the quote itself is
			// escaped, an even count means those backslashes are escaped
			// backslashes (e.g. `\\"`) and this quote terminates the string.
			let backslashCount = 0
			for (let j = i - 1; j >= 0 && string[j] === '\\'; j--) {
				backslashCount++
			}
			if (backslashCount % 2 === 1) {
				// This is an escaped quote, skip it
				i++
				continue
			}

			if (lastOpening === '"') {
				stackOfOpenings.pop()
			} else {
				stackOfOpenings.push('"')
			}
		}

		if (lastOpening === '"') {
			i++
			continue
		}

		if (char === '{' || char === '[') {
			stackOfOpenings.push(char)
		}

		if (char === '}' && lastOpening === '{') {
			stackOfOpenings.pop()
			// If that closed the top-level container, discard any trailing content
			// (e.g. a markdown ``` fence or prose the model appended after the JSON).
			// Otherwise JSON.parse throws "Unexpected non-whitespace character after
			// JSON" and the entire response is dropped.
			if (stackOfOpenings.length === 0) {
				string = string.slice(0, i + 1)
				break
			}
		}

		if (char === ']' && lastOpening === '[') {
			stackOfOpenings.pop()
			if (stackOfOpenings.length === 0) {
				string = string.slice(0, i + 1)
				break
			}
		}

		i++
	}

	// Now close all unclosed openings
	for (let i = stackOfOpenings.length - 1; i >= 0; i--) {
		const opening = stackOfOpenings[i]
		if (opening === '{') {
			string += '}'
		}

		if (opening === '[') {
			string += ']'
		}

		if (opening === '"') {
			string += '"'
		}
	}

	try {
		return JSON.parse(string)
	} catch (_e) {
		return null
	}
}
