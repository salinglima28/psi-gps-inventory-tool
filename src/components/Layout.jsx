import React, { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Layout() {
  const [sports, setSports]           = useState([])
  const [selectedSports, setSelectedSports] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef                   = useRef(null)
  const navigate                      = useNavigate()

  useEffect(() => { fetchSports() }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
    setDropdownOpen(false)
  }

  const selectedLabel = selectedSports.length === 0
    ? 'All Sports'
    : selectedSports.length === 1
      ? sports.find(s => s.id === selectedSports[0])?.name
      : `${selectedSports.length} sports selected`

  const navLinkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-blue-50 text-[#0057B8]'
        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between h-14">

          {/* Brand + links */}
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium text-[#0057B8] tracking-widest uppercase">
              PSI GPS Tracker
            </span>
            <div className="flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/upload" className={navLinkClass}>
                Bulk Unit Upload
              </NavLink>
              <NavLink to="/replacement" className={navLinkClass}>
                Replace a Unit
              </NavLink>
              <NavLink to="/report" className={navLinkClass}>
                Generate Report
              </NavLink>
              <NavLink to="/exceptions" className={navLinkClass}>
                Exceptions
              </NavLink>
            </div>
          </div>

          {/* Sport selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-4 py-1.5 border border-gray-300 rounded-full text-sm bg-white hover:bg-gray-50 transition-colors min-w-[160px] justify-between"
            >
              <span className={`font-medium ${selectedSports.length > 0 ? 'text-[#0057B8]' : 'text-gray-700'}`}>
                {selectedLabel}
              </span>
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">

                {/* All sports option */}
                <button
                  onClick={clearSelection}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors
                    ${selectedSports.length === 0 ? 'bg-blue-50 text-[#0057B8] font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  All Sports
                  {selectedSports.length === 0 && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="border-t border-gray-100 my-1" />

                {sports.map(sport => {
                  const isSelected = selectedSports.includes(sport.id)
                  return (
                    <label
                      key={sport.id}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors
                        ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSport(sport.id)}
                        className="accent-[#0057B8] w-4 h-4 flex-shrink-0"
                      />
                      <div>
                        <div className={`font-medium ${isSelected ? 'text-[#0057B8]' : 'text-gray-800'}`}>
                          {sport.name}
                        </div>
                        {sport.practitioner && (
                          <div className="text-xs text-gray-400">{sport.practitioner}</div>
                        )}
                      </div>
                    </label>
                  )
                })}

                {selectedSports.length > 0 && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={clearSelection}
                      className="w-full text-left px-4 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Clear selection
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet context={{ selectedSports, sports }} />
      </main>
    </div>
  )
}