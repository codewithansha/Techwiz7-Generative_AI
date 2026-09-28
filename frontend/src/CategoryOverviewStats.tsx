import React from 'react'
import { FolderTree, ListTree, Building2 } from 'lucide-react'
import type { Category, Department } from './types'
import './category-overview.css'

export interface CategoryOverviewStatsProps {
  categories: Category[]
  departments: Department[]
  loading?: boolean
}

interface StatCardProps {
  id: string
  label: string
  count: number
  loading?: boolean
  emptyText: string
  subText: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  accentType: 'category' | 'subcategory' | 'department'
}

function StatCard({
  id,
  label,
  count,
  loading,
  emptyText,
  subText,
  icon: Icon,
  accentType,
}: StatCardProps) {
  const isZero = count === 0

  return (
    <article
      id={`cat-stat-${id}`}
      className={`cat-stat-card cat-stat-card--${accentType}`}
      tabIndex={0}
      aria-label={`${label}: ${loading ? 'Loading' : count} ${isZero ? emptyText : subText}`}
    >
      {/* Top row: Icon badge & Uppercase Label */}
      <div className="cat-stat-top">
        <div className="cat-stat-icon-wrapper" aria-hidden="true">
          <Icon size={18} className="cat-stat-icon" />
        </div>
        <span className="cat-stat-label">{label}</span>
      </div>

      {/* Main Count & Supporting Description */}
      <div className="cat-stat-body">
        <div className="cat-stat-count-wrap">
          {loading ? (
            <span className="cat-stat-skeleton" aria-hidden="true" />
          ) : (
            <span className="cat-stat-number">{count.toLocaleString()}</span>
          )}
        </div>
        <p className="cat-stat-subtext">
          {loading ? 'Fetching records…' : isZero ? emptyText : subText}
        </p>
      </div>

      {/* Subtle count-based accent indicator line */}
      <div className="cat-stat-indicator-track" aria-hidden="true">
        <div
          className={`cat-stat-indicator-bar ${isZero && !loading ? 'cat-stat-indicator-bar--empty' : ''}`}
        />
      </div>

      {/* Subtle bottom divider & Overview footer label */}
      <div className="cat-stat-divider" aria-hidden="true" />
      <div className="cat-stat-footer">
        <span className="cat-stat-footer-text">Overview</span>
        <span className="cat-stat-footer-dot" aria-hidden="true" />
      </div>
    </article>
  )
}

export default function CategoryOverviewStats({
  categories,
  departments,
  loading = false,
}: CategoryOverviewStatsProps) {
  // Real data calculations
  const totalCategories = categories.length
  const totalSubcategories = categories.reduce(
    (sum, cat) => sum + (cat.subcategories ? cat.subcategories.length : 0),
    0
  )
  const totalDepartments = departments.length

  return (
    <section
      className="cat-overview-section"
      aria-labelledby="cat-overview-heading"
    >
      {/* Section Header */}
      <div className="cat-overview-header">
        <div className="cat-overview-title-group">
          <h3 id="cat-overview-heading" className="cat-overview-title">
            Overview
          </h3>
          <span className="cat-overview-badge">Live Taxonomy</span>
        </div>
        <p className="cat-overview-subtitle">
          A quick summary of your categories and organizational structure.
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="cat-overview-grid">
        {/* Card 1: Categories */}
        <StatCard
          id="categories"
          label="CATEGORIES"
          count={totalCategories}
          loading={loading}
          emptyText="No categories yet"
          subText="Total Categories"
          icon={FolderTree}
          accentType="category"
        />

        {/* Card 2: Subcategories */}
        <StatCard
          id="subcategories"
          label="SUBCATEGORIES"
          count={totalSubcategories}
          loading={loading}
          emptyText="No subcategories yet"
          subText="Total Subcategories"
          icon={ListTree}
          accentType="subcategory"
        />

        {/* Card 3: Departments */}
        <StatCard
          id="departments"
          label="DEPARTMENTS"
          count={totalDepartments}
          loading={loading}
          emptyText="No departments yet"
          subText="Total Departments"
          icon={Building2}
          accentType="department"
        />
      </div>
    </section>
  )
}
