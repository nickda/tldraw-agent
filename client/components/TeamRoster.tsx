import { useValue } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'
import { useAgents } from '../agent/TldrawAgentAppProvider'

export function TeamRoster() {
	const agents = useAgents()

	return (
		<div className="team-roster">
			{agents.map((agent) => (
				<TeamRosterEntry key={agent.id} agent={agent} />
			))}
		</div>
	)
}

function TeamRosterEntry({ agent }: { agent: TldrawAgent }) {
	const isActive = useValue(
		`roster-active-${agent.id}`,
		() => agent.requests.isGenerating(),
		[agent]
	)

	return (
		<div
			className={`team-roster__entry${isActive ? ' team-roster__entry--active' : ''}`}
		>
			<span
				className="team-roster__dot"
				style={{ backgroundColor: agent.beeColor }}
			/>
			<span className="team-roster__name">{agent.beeName}</span>
		</div>
	)
}
