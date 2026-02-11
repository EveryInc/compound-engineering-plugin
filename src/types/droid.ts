export type DroidCommandFile = {
  name: string
  content: string
}

export type DroidAgentFile = {
  name: string
  content: string
}

export type DroidSkillDir = {
  name: string
  sourceDir: string
}

export type DroidBundle = {
  commands: DroidCommandFile[]
  droids: DroidAgentFile[]
  skillDirs: DroidSkillDir[]
}
