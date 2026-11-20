import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forecast, formatPacific } from '../src/forecast.ts'
import type { Reading } from '../src/forecast.ts'

const at = (iso: string): number => Date.parse(iso)

const reading = (iso: string, percent: number): Reading => ({ at: at(iso), percent })

test('5h forecast that crosses midnight Pacific', () => {
	const readings = [
		reading('2026-11-21T07:30:00Z', 80),
		reading('2026-11-21T07:40:00Z', 85),
		reading('2026-11-21T07:50:00Z', 90),
	]
	const result = forecast(readings, '5h', at('2026-11-21T10:00:00Z'), at('2026-11-21T07:50:00Z'))
	assert.deepEqual(result, { kind: 'hit', at: at('2026-11-21T08:10:00Z') })
	assert.equal(formatPacific(at('2026-11-21T08:10:00Z')), 'Sat Nov 21, 12:10 AM PST')
})

test('7d forecast that lands exactly on the reset is fine', () => {
	const readings = [
		reading('2026-11-19T20:00:00Z', 60),
		reading('2026-11-20T08:00:00Z', 66),
		reading('2026-11-20T20:00:00Z', 72),
	]
	const result = forecast(readings, '7d', at('2026-11-23T04:00:00Z'), at('2026-11-20T20:00:00Z'))
	assert.deepEqual(result, { kind: 'fine' })
})

test('7d forecast one minute before the week boundary is a hit', () => {
	const readings = [
		reading('2026-11-19T20:00:00Z', 60),
		reading('2026-11-20T08:00:00Z', 66),
		reading('2026-11-20T20:00:00Z', 72),
	]
	const result = forecast(readings, '7d', at('2026-11-23T04:01:00Z'), at('2026-11-20T20:00:00Z'))
	assert.deepEqual(result, { kind: 'hit', at: at('2026-11-23T04:00:00Z') })
	assert.equal(formatPacific(at('2026-11-23T04:00:00Z')), 'Sun Nov 22, 8:00 PM PST')
})

test('7d forecast after the week boundary is fine', () => {
	const readings = [
		reading('2026-11-19T20:00:00Z', 60),
		reading('2026-11-20T08:00:00Z', 66),
		reading('2026-11-20T20:00:00Z', 72),
	]
	const result = forecast(readings, '7d', at('2026-11-22T20:00:00Z'), at('2026-11-20T20:00:00Z'))
	assert.deepEqual(result, { kind: 'fine' })
})

test('forecast across the spring daylight saving change on 8 March 2026', () => {
	const readings = [
		reading('2026-03-08T09:10:00Z', 70),
		reading('2026-03-08T09:25:00Z', 75),
		reading('2026-03-08T09:40:00Z', 80),
	]
	const result = forecast(readings, '5h', at('2026-03-08T14:00:00Z'), at('2026-03-08T09:40:00Z'))
	assert.deepEqual(result, { kind: 'hit', at: at('2026-03-08T10:40:00Z') })
	assert.equal(formatPacific(at('2026-03-08T10:40:00Z')), 'Sun Mar 8, 3:40 AM PDT')
})

test('forecast across the autumn daylight saving change on 1 November 2026', () => {
	const readings = [
		reading('2026-11-01T08:10:00Z', 80),
		reading('2026-11-01T08:25:00Z', 85),
		reading('2026-11-01T08:40:00Z', 90),
	]
	const result = forecast(readings, '5h', at('2026-11-01T12:00:00Z'), at('2026-11-01T08:40:00Z'))
	assert.deepEqual(result, { kind: 'hit', at: at('2026-11-01T09:10:00Z') })
	assert.equal(formatPacific(at('2026-11-01T08:40:00Z')), 'Sun Nov 1, 1:40 AM PDT')
	assert.equal(formatPacific(at('2026-11-01T09:10:00Z')), 'Sun Nov 1, 1:10 AM PST')
})

test('a flat pace is fine', () => {
	const readings = [
		reading('2026-11-20T10:00:00Z', 50),
		reading('2026-11-20T10:15:00Z', 50),
		reading('2026-11-20T10:30:00Z', 50),
	]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'fine' })
})

test('a falling pace is fine', () => {
	const readings = [
		reading('2026-11-20T10:00:00Z', 60),
		reading('2026-11-20T10:15:00Z', 55),
		reading('2026-11-20T10:30:00Z', 50),
	]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'fine' })
})

test('5h forecast ignores readings older than 30 minutes', () => {
	const readings = [
		reading('2026-11-20T08:30:00Z', 0),
		reading('2026-11-20T10:00:00Z', 50),
		reading('2026-11-20T10:15:00Z', 50),
		reading('2026-11-20T10:30:00Z', 50),
	]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'fine' })
})

test('already at 100 percent is a hit at the latest reading', () => {
	const readings = [
		reading('2026-11-20T10:00:00Z', 98),
		reading('2026-11-20T10:15:00Z', 99),
		reading('2026-11-20T10:30:00Z', 100),
	]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'hit', at: at('2026-11-20T10:30:00Z') })
})

test('no readings is not enough data', () => {
	const result = forecast([], '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'not-enough-data' })
})

test('two readings is not enough data', () => {
	const readings = [reading('2026-11-20T10:20:00Z', 40), reading('2026-11-20T10:30:00Z', 50)]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'not-enough-data' })
})

test('three readings, two inside the 5h span, is not enough data', () => {
	const readings = [
		reading('2026-11-20T09:00:00Z', 10),
		reading('2026-11-20T10:20:00Z', 40),
		reading('2026-11-20T10:30:00Z', 50),
	]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'not-enough-data' })
})

test('three readings at the same instant is not enough data', () => {
	const readings = [
		reading('2026-11-20T10:30:00Z', 40),
		reading('2026-11-20T10:30:00Z', 45),
		reading('2026-11-20T10:30:00Z', 50),
	]
	const result = forecast(readings, '5h', at('2026-11-20T14:00:00Z'), at('2026-11-20T10:30:00Z'))
	assert.deepEqual(result, { kind: 'not-enough-data' })
})
