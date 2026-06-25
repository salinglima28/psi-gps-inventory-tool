import React, { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function StatCard({ label, value, sub, color = 'blue', warning = false }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    gray:   'bg-gray-50 border-gray-200 text-gray-700',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="text-3xl font-bold">{value ?? '—'}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { selectedSports, sports } = useOutletContext()
  const [summary, setSummary] = useState(null)
  const [allocation, setAllocation] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
  }, [selectedSports])

  async function fetchData() {
    setLoading(true)

    // Academy summary
    const { data: summaryData } = await supabase
      .from('academy_summary')
      .select('*')
      .single()

    // Sport allocation
    let query = supabase
      .from('sport_allocation')
      .select('*')
      .order('sport_name')

    if (selectedSports.length > 0) {
      query = query.in('sport_id', selectedSports)
    }

    const { data: allocationData } = await query

    setSummary(summaryData)
    setAllocation(allocationData || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Academy Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          PlayerData contract — {summary?.total_contracted} total units across {sports.length} sports
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Contracted"
          value={summary?.total_contracted}
          color="blue"
        />
        <StatCard
          label="Accounted For"
          value={summary?.total_accounted_for}
          sub={`of ${summary?.total_contracted} contracted`}
          color="green"
        />
        <StatCard
          label="Assigned to Athletes"
          value={summary?.total_assigned}
          color="green"
        />
        <StatCard
          label="Spare Pool"
          value={summary?.total_spare}
          color="blue"
        />
        <StatCard
          label="Broken (With Sport)"
          value={summary?.total_broken_with_sport}
          color={summary?.total_broken_with_sport > 0 ? 'yellow' : 'gray'}
        />
        <StatCard
          label="Broken (With Dept)"
          value={summary?.total_broken_with_dept}
          color={summary?.total_broken_with_dept > 0 ? 'yellow' : 'gray'}
        />
        <StatCard
          label="At PlayerData"
          value={summary?.total_at_playerdata}
          color="gray"
        />
        <StatCard
          label="Lost / Missing"
          value={summary?.total_lost}
          color={summary?.total_lost > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* GPS vs IMU breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Unit Type Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total GPS Units"    value={summary?.total_gps}        color="blue" />
          <StatCard label="GPS Active"         value={summary?.total_gps_active}  color="green" />
          <StatCard label="Total IMU Units"    value={summary?.total_imu}        color="blue" />
          <StatCard label="IMU Active"         value={summary?.total_imu_active}  color="green" />
        </div>
      </div>

      {/* Sport allocation table */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Sport Allocation</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sport</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Practitioner</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Contracted</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Assigned</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Spare</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Broken</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Lost</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">GPS</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">IMU</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {allocation.map((row, i) => {
                const delta = row.allocation_delta
                const isOver  = delta > 0
                const isUnder = delta < 0
                const isOk    = delta === 0
                return (
                  <tr
                    key={row.sport_id}
                    onClick={() => navigate(`/sport/${row.sport_id}`)}
                    className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{row.sport_name}</td>
                    <td className="px-4 py-3 text-gray-500">{row.practitioner}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.contracted_units}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.assigned}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.zero_spares_warning ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                        {row.spare}
                        {row.zero_spares_warning && ' ⚠️'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.broken_held > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
                        {row.broken_held}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.lost > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                        {row.lost}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.gps_count}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.imu_count}</td>
                    <td className="px-4 py-3 text-center">
                      {isOk && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ✓ On target
                        </span>
                      )}
                      {isOver && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          +{delta} over
                        </span>
                      )}
                      {isUnder && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {delta} under
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}