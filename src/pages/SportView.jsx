import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const STATUS_LABELS = {
  assigned:           'Assigned',
  spare:              'Spare',
  broken_with_sport:  'Broken (With Sport)',
  broken_with_dept:   'Broken (With Dept)',
  at_playerdata:      'At PlayerData',
  lost:               'Lost',
}

const STATUS_COLORS = {
  assigned:           'bg-green-100 text-green-700',
  spare:              'bg-blue-100 text-blue-700',
  broken_with_sport:  'bg-yellow-100 text-yellow-700',
  broken_with_dept:   'bg-orange-100 text-orange-700',
  at_playerdata:      'bg-gray-100 text-gray-600',
  lost:               'bg-red-100 text-red-700',
}

const HEALTH_LABELS = {
  unaccounted: 'Unaccounted for units',
  no_spare:    'No spares available',
  low_spare:   'Low on spares',
  ok:          'Healthy',
}

const HEALTH_COLORS = {
  unaccounted: 'bg-red-50 border-red-200 text-red-600',
  no_spare:    'bg-red-50 border-red-200 text-red-600',
  low_spare:   'bg-amber-50 border-amber-200 text-amber-600',
  ok:          'bg-green-50 border-green-200 text-green-600',
}

export default function SportView() {
  const { sportId } = useParams()
  const navigate = useNavigate()
  const [sport, setSport] = useState(null)
  const [allocation, setAllocation] = useState(null)
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchData()
  }, [sportId])

  async function fetchData() {
    setLoading(true)

    const { data: sportData } = await supabase
      .from('sports')
      .select('*')
      .eq('id', sportId)
      .single()

    const { data: allocationData } = await supabase
      .from('sport_allocation')
      .select('*')
      .eq('sport_id', sportId)
      .single()

    const { data: unitsData } = await supabase
      .from('units')
      .select(`
        id,
        serial_number,
        status,
        unit_type,
        firmware_version,
        acquired_date,
        acquired_source,
        notes
      `)
      .eq('sport_id', sportId)
      .order('serial_number')

    setSport(sportData)
    setAllocation(allocationData)
    setUnits(unitsData || [])
    setLoading(false)
  }

  const filteredUnits = units.filter(u => {
    const statusOk = statusFilter === 'all' || u.status === statusFilter
    const typeOk   = typeFilter === 'all'   || u.unit_type === typeFilter
    const searchOk = search === '' ||
      u.serial_number.toLowerCase().includes(search.toLowerCase())
    return statusOk && typeOk && searchOk
  })

  // GPS/IMU breakdown computed client-side — the live sport_allocation
  // view doesn't carry these columns (only 01/05's version did; the
  // 06 migration replaced the view without them)
  const gpsCount = units.filter(u => u.unit_type === 'GPS').length
  const imuCount = units.filter(u => u.unit_type === 'IMU').length
  const gpsActive = units.filter(u => u.unit_type === 'GPS' && ['assigned', 'spare'].includes(u.status)).length
  const imuActive = units.filter(u => u.unit_type === 'IMU' && ['assigned', 'spare'].includes(u.status)).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading...
      </div>
    )
  }

  if (!sport) {
    return (
      <div className="text-center py-16 text-gray-400">
        Sport not found.
      </div>
    )
  }

  const brokenTotal = (allocation?.broken_with_sport || 0) + (allocation?.broken_with_dept || 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-blue-600 hover:underline mb-1 flex items-center gap-1"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{sport.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Practitioner: {sport.practitioner}</p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Upload CSV
        </button>
      </div>

      {/* Allocation summary cards */}
      {allocation && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{allocation.contracted_units}</div>
            <div className="text-xs text-gray-500 mt-1">Contracted</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{allocation.assigned}</div>
            <div className="text-xs text-gray-500 mt-1">Assigned</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${['no_spare', 'unaccounted'].includes(allocation.health) ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className={`text-2xl font-bold ${['no_spare', 'unaccounted'].includes(allocation.health) ? 'text-red-600' : 'text-blue-600'}`}>
              {allocation.spare}
            </div>
            <div className="text-xs text-gray-500 mt-1">Spare</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <div className={`text-2xl font-bold ${brokenTotal > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
              {brokenTotal}
            </div>
            <div className="text-xs text-gray-500 mt-1">Broken</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${allocation.unaccounted_for > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className={`text-2xl font-bold ${allocation.unaccounted_for > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {allocation.unaccounted_for}
            </div>
            <div className="text-xs text-gray-500 mt-1">Unaccounted</div>
          </div>
        </div>
      )}

      {/* Health flag */}
      {allocation && allocation.health !== 'ok' && (
        <div className={`border rounded-lg px-4 py-2 text-sm font-medium ${HEALTH_COLORS[allocation.health]}`}>
          ⚠️ {HEALTH_LABELS[allocation.health]}
        </div>
      )}

      {/* GPS vs IMU */}
      <div className="flex gap-3">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium text-gray-700">GPS:</span>{' '}
          <span className="text-blue-600 font-semibold">{gpsCount}</span>
          <span className="text-gray-400 ml-1">({gpsActive} active)</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium text-gray-700">IMU:</span>{' '}
          <span className="text-purple-600 font-semibold">{imuCount}</span>
          <span className="text-gray-400 ml-1">({imuActive} active)</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search serial number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">GPS + IMU</option>
          <option value="GPS">GPS Only</option>
          <option value="IMU">IMU Only</option>
        </select>
        <span className="text-sm text-gray-400">
          {filteredUnits.length} of {units.length} units
        </span>
      </div>

      {/* Units table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Serial Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Since</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-400">
                  No units match the current filters.
                </td>
              </tr>
            ) : (
              filteredUnits.map((unit, i) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  index={i}
                  onClick={() => navigate(`/unit/${unit.id}`)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}

function UnitRow({ unit, index, onClick }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${
        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
      }`}
    >
      <td className="px-4 py-3 font-mono text-xs text-gray-800">{unit.serial_number}</td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          unit.unit_type === 'IMU'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {unit.unit_type}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[unit.status]}`}>
          {STATUS_LABELS[unit.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">
        {unit.acquired_date
          ? new Date(unit.acquired_date).toLocaleDateString()
          : '—'}
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[200px]">
        {unit.notes || '—'}
      </td>
    </tr>
  )
}
