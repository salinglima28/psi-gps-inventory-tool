import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SportView from './pages/SportView'
import UnitDetail from './pages/UnitDetail'
import CSVUpload from './pages/CSVUpload'
import Exceptions from './pages/Exceptions'
import ReplaceUnitPage from './pages/ReceiveReplacement'

export default function App() {
  return (
    <BrowserRouter basename="/psi-gps-inventory-tool">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sport/:sportId" element={<SportView />} />
          <Route path="unit/:unitId" element={<UnitDetail />} />
          <Route path="upload" element={<CSVUpload />} />
          <Route path="exceptions" element={<Exceptions />} />
          <Route path="replacement" element={<ReplaceUnitPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}