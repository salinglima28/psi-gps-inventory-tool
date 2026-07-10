import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Exceptions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [exceptions, setExceptions] = useState({
    noSpares:          [],
    lowSpares:         [],
    unaccounted:       [],
    overAllocated:     [],
    brokenNotReturned: [],
    lost:              [],
  })

  useEffect(() => {
    fetchExceptions()
  }, [])

  async function fetchExceptions() {
    setLoading(true)

    const { data: allocation } = await supabase
      .from('sport_allocation')
      .select('*')

    const noSpares      = allocation?.filter(s => s.health === 'no_spare') || []
    const lowSpares      = allocation?.filter(s => s.health === 'low_spare') || []
    const unaccounted    = allocation?.filter(s => s.unaccounted_for > 0) || []
    const overAllocated  = allocation?.filter(s => s.total_on_record > s.contracted_units) || []

    // Broken units held more than 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: brokenUnits } = await supabase
      .from('units')
      .select('id, serial_number, sport_id, updated_at, sports(name)')
      .eq('status', 'broken_with_sport')
      .lt('updated_at', thirtyDaysAgo.toISOString())

    // Lost units
    const { data: lostUnits } = await supabase
      .from('units')
      .select('id, serial_number, sport_id, updated_at, sports(name)')
      .eq('status', 'lost')

    setExceptions({
      noSpares,
      lowSpares,
      unaccounted,
      overAllocated,
      brokenNotReturned: brokenUnits || [],
      lost:              lostUnits   || [],
    })
    setLoading(false)
  }

  const totalExceptions =
    exceptions.noSpares.length +
    exceptions.lowSpares.length +
    exceptions.unaccounted.length +
    exceptions.overAllocated.length +
    exceptions.brokenNotReturned.length +
    exceptions.lost.length

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
        title="Zero Spares"
        color="red"
        icon="⚠️"
        items={exceptions.noSpares}
        description="Sports with no spare units available. Any broken unit leaves the sport short until a replacement arrives."
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
        title="Low Spares"
        color="yellow"
        icon="📉"
        items={exceptions.lowSpares}
        description="Sports running low on spare units relative to their contracted amount — worth restocking soon."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.sport_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.practitioner}</span>
            </div>
            <span className="text-sm text-yellow-600 font-medium">
              {item.spare} spare of {item.contracted_units} contracted
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Unaccounted For Units"
        color="red"
        icon="❓"
        items={exceptions.unaccounted}
        description="Sports with fewer units on record than contracted. May indicate units never entered into inventory."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.sport_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.practitioner}</span>
            </div>
            <span className="text-sm text-red-600 font-medium">
              {item.total_on_record} of {item.contracted_units} · {item.unaccounted_for} unaccounted
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Over Contracted Allocation"
        color="yellow"
        icon="📈"
        items={exceptions.overAllocated}
        description="Sports with more units on record than contracted. May need redistribution."
        renderItem={item => (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">{item.sport_name}</span>
              <span className="text-gray-400 text-xs ml-2">{item.practitioner}</span>
            </div>
            <span className="text-sm text-yellow-600 font-medium">
              {item.total_on_record} of {item.contracted_units} · +{item.total_on_record - item.contracted_units} over
            </span>
          </div>
        )}
      />

      <ExceptionSection
        title="Broken Units Held Over 30 Days"
        color="yellow"
        icon="🔧"
        items={exceptions.brokenNotReturned}
        description="These units have been marked broken with the sport for more than 30 days and have not been transferred to the department."
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
        title="Lost Units"
        color="red"
        icon="❓"
        items={exceptions.lost}
        description="Units flagged as lost. This is a terminal status — these remain in the system but reduce the sport's effective inventory."
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
