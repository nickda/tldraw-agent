import { describe, expect, test } from 'bun:test'
import { executorVoiceInstruction, pickSlackGrumble } from './executorVoice'

describe('executorVoiceInstruction', () => {
	test('gives MacBee a Scottish voice instruction', () => {
		const instruction = executorVoiceInstruction('MacBee')
		expect(instruction).toContain('MacBee')
		expect(instruction.toLowerCase()).toContain('scottish')
		expect(instruction).toContain('message action')
	})

	test('gives WannaBee a reluctant/distracted voice instruction', () => {
		const instruction = executorVoiceInstruction('WannaBee')
		expect(instruction).toContain('WannaBee')
		expect(instruction).toContain('message action')
	})

	test('returns no instruction for other bees', () => {
		expect(executorVoiceInstruction('Beeyonce')).toBe('')
		expect(executorVoiceInstruction('Chairman Meow')).toBe('')
	})
})

describe('pickSlackGrumble', () => {
	test('substitutes the slacker name into the grumble', () => {
		expect(pickSlackGrumble('WannaBee', 0)).toContain('WannaBee')
		expect(pickSlackGrumble('WannaBee', 0)).not.toContain('{name}')
	})

	test('roll=0 and roll near 1 both return valid in-bounds grumbles', () => {
		expect(pickSlackGrumble('WannaBee', 0).length).toBeGreaterThan(0)
		const nearOne = pickSlackGrumble('WannaBee', 0.999999)
		expect(nearOne.length).toBeGreaterThan(0)
		expect(nearOne).not.toContain('{name}')
	})
})
