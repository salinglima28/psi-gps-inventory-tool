import React, { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function StatCard({ label, value, sub, variant = 'default' }) {
  const base = 'rounded-lg p-4 border'
  const variants = {
    default: 'bg-white border-gray-200',
    blue:    'bg-white border-l-4 border-l-[#0057B8] border-gray-200',
    alert:   'bg-white border-l-4 border-l-red-500 border-gray-200',
    muted:   'bg-gray-50 border-gray-200',
  }
  const valueColors = {
    default: 'text-gray-900',
    blue:    'text-[#0057B8]',
    alert:   'text-red-600',
    muted:   'text-gray-500',
  }
  return (
    <div className={`${base} ${variants[variant]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">{label}</div>
      <div className={`text-3xl font-medium ${valueColors[variant]}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function HealthBadge({ health, delta }) {
  if (health === 'unaccounted')
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">{delta} unaccounted</span>
  if (health === 'no_spare')
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">No spare</span>
  if (health === 'low_spare')
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Low spare</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">On track</span>
}

export default function Dashboard() {
  const { selectedSports, sports } = useOutletContext()
  const [allocation, setAllocation] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [selectedSports])

  async function fetchData() {
    setLoading(true)
    let query = supabase.from('sport_allocation').select('*').order('sport_name')
    if (selectedSports.length > 0) {
      query = query.in('sport_id', selectedSports)
    }
    const { data } = await query
    setAllocation(data || [])
    setLoading(false)
  }

  // Header context
  const isSingle   = selectedSports.length === 1
  const isMulti    = selectedSports.length > 1
  const isAll      = selectedSports.length === 0
  const singleSport = isSingle ? allocation[0] : null

  const pageEyebrow = isAll    ? 'Academy view'
                    : isSingle ? 'Sport view'
                    :            `${selectedSports.length} sports selected`

  const pageTitle = isAll      ? 'All Sports'
                  : isSingle   ? (singleSport?.sport_name ?? '...')
                  :              sports
                      .filter(s => selectedSports.includes(s.id))
                      .map(s => s.name)
                      .join(', ')

  const pageSub = isAll
    ? `${sports.length} sports · ${allocation.reduce((a, r) => a + (r.contracted_units || 0), 0)} total contracted units`
    : isSingle
    ? `${singleSport?.practitioner || 'No practitioner'} · ${singleSport?.contracted_units} contracted units`
    : `${allocation.reduce((a, r) => a + (r.contracted_units || 0), 0)} contracted across selected sports`

  // Totals scoped to whatever is selected
  const totals = allocation.reduce((acc, r) => ({
    contracted:        acc.contracted        + (r.contracted_units   || 0),
    assigned:          acc.assigned          + (r.assigned           || 0),
    spare:             acc.spare             + (r.spare              || 0),
    broken_with_sport: acc.broken_with_sport + (r.broken_with_sport  || 0),
    broken_with_dept:  acc.broken_with_dept  + (r.broken_with_dept   || 0),
    at_playerdata:     acc.at_playerdata     + (r.at_playerdata      || 0),
    lost:              acc.lost              + (r.lost               || 0),
    unaccounted_for:   acc.unaccounted_for   + (r.unaccounted_for    || 0),
    gps_count:         acc.gps_count         + (r.gps_count          || 0),
    gps_active:        acc.gps_active        + (r.gps_active         || 0),
    imu_count:         acc.imu_count         + (r.imu_count          || 0),
    imu_active:        acc.imu_active        + (r.imu_active         || 0),
  }), {
    contracted: 0, assigned: 0, spare: 0,
    broken_with_sport: 0, broken_with_dept: 0,
    at_playerdata: 0, lost: 0, unaccounted_for: 0,
    gps_count: 0, gps_active: 0, imu_count: 0, imu_active: 0,
  })

  // Show unit type breakdown only in all-sports or dept lead view
  const showUnitTypes = isAll

  // Highlight selected sport rows in the table
  const isRowHighlighted = (sportId) =>
    isSingle && sportId === selectedSports[0]

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading...</div>
  )

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#0057B8] mb-1">
          {pageEyebrow}
        </p>
        <h1 className="text-2xl font-medium text-gray-900">{pageTitle}</h1>
        <p className="text-sm text-gray-400 mt-1">{pageSub}</p>
      </div>

      {/* Status cards — always scoped to selection */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatCard
          label="Contracted"
          value={totals.contracted}
          variant="blue"
        />
        <StatCard
          label="Assigned"
          value={totals.assigned}
          variant="default"
        />
        <StatCard
          label="Spare pool"
          value={totals.spare}
          variant="default"
        />
        <StatCard
          label="Broken"
          value={totals.broken_with_sport + totals.broken_with_dept}
          sub={`${totals.broken_with_sport} with sport · ${totals.broken_with_dept} with dept`}
          variant="muted"
        />
        <StatCard
          label="Lost"
          value={totals.lost}
          variant={totals.lost > 0 ? 'muted' : 'muted'}
        />
        <StatCard
          label="Unaccounted for"
          value={totals.unaccounted_for}
          sub="contracted minus all known"
          variant={totals.unaccounted_for > 0 ? 'alert' : 'muted'}
        />
      </div>

      {/* Unit type breakdown — all-sports view only */}
      {showUnitTypes && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-3">
            Unit type breakdown
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total GPS units" value={totals.gps_count}   variant="default" />
            <StatCard label="GPS assigned"    value={totals.gps_active}  variant="default" />
            <StatCard label="Total IMU units" value={totals.imu_count}   variant="default" />
            <StatCard label="IMU assigned"    value={totals.imu_active}  variant="default" />
          </div>
        </div>
      )}

      {/* Sport allocation table — always shows all sports, highlights selected */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-3">
          Sport allocation
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Sport</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Practitioner</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Contracted</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Assigned</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Spare</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Broken</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Lost</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Unaccounted</th>
                <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {allocation.map((row) => (
                <tr
                  key={row.sport_id}
                  onClick={() => navigate(`/sport/${row.sport_id}`)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors last:border-0
                    ${isRowHighlighted(row.sport_id)
                      ? 'bg-blue-50'
                      : 'hover:bg-blue-50'
                    }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.sport_name}
                    {isRowHighlighted(row.sport_id) && (
                      <span className="ml-2 text-xs text-[#0057B8]">selected</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{row.practitioner || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{row.contracted_units}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{row.assigned}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={
                      row.spare === 0
                        ? 'text-red-600 font-medium'
                        : row.spare < row.contracted_units * 0.1
                        ? 'text-amber-600'
                        : 'text-gray-700'
                    }>
                      {row.spare}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={(row.broken_with_sport + row.broken_with_dept) > 0 ? 'text-gray-600' : 'text-gray-300'}>
                      {(row.broken_with_sport || 0) + (row.broken_with_dept || 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={row.lost > 0 ? 'text-gray-600' : 'text-gray-300'}>
                      {row.lost}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={row.unaccounted_for > 0 ? 'text-red-600 font-medium' : 'text-gray-300'}>
                      {row.unaccounted_for}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <HealthBadge health={row.health} delta={row.unaccounted_for} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}