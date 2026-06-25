import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Exceptions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [exceptions, setExceptions] = useState({
    zerospares:       [],
    underallocated:   [],
    overallocated:    [],
    brokenNotReturned:[],
    lost:             [],
    multipleUnits:    [],
    unitsMultiAthlete:[],
  })

  useEffect(() => {
    fetchExceptions()
  }, [])

  async function fetchExceptions() {
    setLoading(true)

    // Sports with zero spares
    const { data: allocation } = await supabase
      .from('sport_allocation')
      .select('*')

    const zerospares        = allocation?.filter(s => s.zero_spares_warning && s.accounted_for > 0) || []
    const underallocated    = allocation?.filter(s => s.allocation_delta < 0) || []
    const overallocated     = allocation?.filter(s => s.allocation_delta > 0) || []

    // Broken units held more than 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: brokenUnits } = await supabase
      .from('units')
      .select('id, serial_number, sport_id, updated_at, sports(name)')
      .eq('status', 'broken_held')
      .lt('updated_at', thirtyDaysAgo.toISOString())

    // Lost units
    const { data: lostUnits } = await supabase
      .from('units')
      .select('id, serial_number, sport_id, updated_at, sports(name)')
      .eq('status', 'lost_missing')

    // Athletes with multiple active units
    const { data: activeAssignments } = await supabase
      .from('assignments')
      .select('athlete_name, sport_id, unit_id, sports(name)')
      .is('end_date', null)

    const athleteUnitCount = {}
    activeAssignments?.forEach(a => {
      const key = `${a.athlete_name}__${a.sport_id}`
      if (!athleteUnitCount[key]) {
        athleteUnitCount[key] = { athlete_name: a.athlete_name, sport: a.sports?.name, units: [] }
      }
      athleteUnitCount[key].units.push(a.unit_id)
    })
    const multipleUnits = Object.values(athleteUnitCount).filter(a => a.units.length > 1)

    // Units with multiple active assignments
    const unitAssignCount = {}
    activeAssignments?.forEach(a => {
      if (!unitAssignCount[a.unit_id]) unitAssignCount[a.unit_id] = []
      unitAssignCount[a.unit_id].push(a.athlete_name)
    })
    const unitsMultiAthlete = Object.entries(unitAssignCount)
      .filter(([, athletes]) => athletes.length > 1)
      .map(([unit_id, athletes]) => ({ unit_id, athletes }))

    setExceptions({
      zerospares,
      underallocated,
      overallocated,
      brokenNotReturned: brokenUnits || [],
      lost:              lostUnits   || [],
      multipleUnits,
      unitsMultiAthlete,
    })
    setLoading(false)
  }

  const totalExceptions =
    exceptions.zerospares.length +
    exceptions.underallocated.length +
    exceptions.overallocated.length +
    exceptions.brokenNotReturned.length +
    exceptions.lost.length +
    exceptions.multipleUnits.length +
    exceptions.unitsMultiAthlete.length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exceptions Report</h1>
          <p className="text-gray-500 text-sm mt-1">
            Auto-generated data quality flags that need attention.
          </p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${
          totalExceptions === 0
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {totalExceptions === 0 ? '✓ No exceptions' : `${totalExceptions} exceptions`}
        </div>
      </div>

      {totalExceptions === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-700 font-medium">All clear — no data quality issues found.</p>
        </div>
      )}

      <ExceptionSection
        title="Zero Spares Warning"
        color="red"
        icon="⚠️"
        items={exceptions.zerospares}
        description="Sports with no spare units available. Any broken unit will leave an athlete without a device."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.sport_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.practitioner}</span>
            </div>
            <span className="text-sm text-red-600 font-medium">
              {item.assigned} assigned · 0 spare
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Under Contracted Allocation"
        color="red"
        icon="📉"
        items={exceptions.underallocated}
        description="Sports with fewer units than contracted. May indicate units in transit or lost."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.sport_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.practitioner}</span>
            </div>
            <span className="text-sm text-red-600 font-medium">
              {item.accounted_for} of {item.contracted_units} · {item.allocation_delta} under
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Over Contracted Allocation"
        color="yellow"
        icon="📈"
        items={exceptions.overallocated}
        description="Sports with more units than contracted. May need redistribution."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.sport_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.practitioner}</span>
            </div>
            <span className="text-sm text-yellow-600 font-medium">
              {item.accounted_for} of {item.contracted_units} · +{item.allocation_delta} over
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Broken Units Held Over 30 Days"
        color="yellow"
        icon="🔧"
        items={exceptions.brokenNotReturned}
        description="These units have been marked broken for more than 30 days and have not been transferred to the department."
        renderItem={item => (
          <div
            className="flex items-center justify-between cursor-pointer hover:text-blue-600"
            onClick={() => navigate(`/unit/${item.id}`)}
          >
            <div>
              <span className="font-mono text-xs text-gray-800">{item.serial_number}</span>
              <span className="text-gray-400 text-xs ml-2">{item.sports?.name}</span>
            </div>
            <span className="text-sm text-gray-400">
              Since {new Date(item.updated_at).toLocaleDateString()}
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Lost / Missing Units"
        color="red"
        icon="❓"
        items={exceptions.lost}
        description="Units flagged as lost or missing. These remain in the system but reduce the sport's effective inventory."
        renderItem={item => (
          <div
            className="flex items-center justify-between cursor-pointer hover:text-blue-600"
            onClick={() => navigate(`/unit/${item.id}`)}
          >
            <div>
              <span className="font-mono text-xs text-gray-800">{item.serial_number}</span>
              <span className="text-gray-400 text-xs ml-2">{item.sports?.name}</span>
            </div>
            <span className="text-sm text-gray-400">
              Since {new Date(item.updated_at).toLocaleDateString()}
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Athletes with Multiple Units"
        color="yellow"
        icon="👤"
        items={exceptions.multipleUnits}
        description="Athletes with more than one active unit assignment. Each athlete should hold exactly one unit."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.athlete_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.sport}</span>
            </div>
            <span className="text-sm text-yellow-600 font-medium">
              {item.units.length} units assigned
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Units with Multiple Active Assignments"
        color="red"
        icon="🔁"
        items={exceptions.unitsMultiAthlete}
        description="Units assigned to more than one athlete simultaneously. This should never happen — requires immediate correction."
        renderItem={item => (
          <div
            className="flex items-center justify-between cursor-pointer hover:text-blue-600"
            onClick={() => navigate(`/unit/${item.unit_id}`)}
          >
            <span className="font-mono text-xs text-gray-800">{item.unit_id}</span>
            <span className="text-sm text-red-600">
              Assigned to: {item.athletes.join(', ')}
            </span>
          </div>
        )}
      />

    </div>
  )
}

function ExceptionSection({ title, color, icon, items, description, renderItem }) {
  if (items.length === 0) return null

  const colors = {
    red:    'border-red-200 bg-red-50',
    yellow: 'border-yellow-200 bg-yellow-50',
  }
  const headerColors = {
    red:    'text-red-800',
    yellow: 'text-yellow-800',
  }
  const countColors = {
    red:    'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div className={`border rounded-xl overflow-hidden ${colors[color]}`}>
      <div className={`px-4 py-3 flex items-center justify-between border-b ${colors[color]}`}>
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <h3 className={`font-semibold ${headerColors[color]}`}>{title}</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${countColors[color]}`}>
          {items.length}
        </span>
      </div>
      <div className="px-4 py-2 bg-white/60">
        <p className="text-xs text-gray-500 mb-3">{description}</p>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}