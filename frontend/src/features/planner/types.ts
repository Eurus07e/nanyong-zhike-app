export type PlannerCourse = {
  id: string
  name: string
  credits?: string
}

export type PlanTask = {
  id: string
  text: string
  done: boolean
}

export type PlanResource = {
  id: string
  label: string
  url?: string
}

export type PlanDocument = {
  schemaVersion: 1
  id: string
  templateId: 'semester' | 'cross-major'
  title: string
  goal: string
  startDate: string
  endDate: string
  courses: PlannerCourse[]
  tasks: PlanTask[]
  resources: PlanResource[]
  weeklyReview: string
  createdAt: string
  updatedAt: string
}

export type PlannerEnvelope = {
  schemaVersion: 1
  plans: PlanDocument[]
  activePlanId: string | null
}
