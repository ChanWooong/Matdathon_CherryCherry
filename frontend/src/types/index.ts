export interface IssueDraft {
  title: string
  body: string
  labels: string[]
  assignee?: string | null
  due_date?: string | null
  acceptance_criteria: string[]
  source_quote?: string | null
}

export interface Repo {
  full_name: string
  name: string
  owner: string
}
