import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Layout() {
  const [sports, setSports] = useState([])
  const [selectedSports, setSelectedSports] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchSports()
  }, [])

  async function fetchSports() {
    const { data } = await supabase
      .from('sports')
      .select('id, name, practitioner')
      .order('name')
    if (data) setSports(data)
  }

  function toggleSport(sportId) {
    setSelectedSports(prev =>
      prev.includes(sportId)
        ? prev.filter(id => id !== sportId)
        : [...prev, sportId]
    )
  }

  function clearSelection() {
    setSelectedSports([])
  }

  const selectedLabel = selectedSports.length === 0
    ? 'All Sports'
    : selectedSports.length === 1
      ? sports.find(s => s.id === selectedSports[0])?.name
      : `${selectedSports.length} Sports Selected`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation bar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg text-blue-900 tracking-tight">
            PSI GPS Tracker
          </span>
          <div className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/upload"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              CSV Upload
            </NavLink>
            <NavLink
              to="/replacement"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              Receive Replacement
            </NavLink>
            <NavLink
              to="/exceptions"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              Exceptions
            </NavLink>
          </div>
        </div>

        {/* Sport selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-4 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 transition-colors min-w-[160px] justify-between"
          >
            <span className="text-gray-700 font-medium">{selectedLabel}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              <button
                onClick={() => { clearSelection(); setDropdownOpen(false) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 font-medium text-blue-700"
              >
                All Sports
              </button>
              <div className="border-t border-gray-100 my-1" />
              {sports.map(sport => (
                <label
                  key={sport.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSports.includes(sport.id)}
                    onChange={() => toggleSport(sport.id)}
                    className="accent-blue-600"
                  />
                  <div>
                    <div className="font-medium text-gray-800">{sport.name}</div>
                   <div className="text-xs text-gray-400">{sport.practitioner}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet context={{ selectedSports, sports }} />
      </main>
    </div>
  )
}