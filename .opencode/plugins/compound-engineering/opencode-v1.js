export function createV1Plugin({ skills, skillsDir }) {
  return async () => ({
    config: async (config) => {
      config.skills = config.skills || {}
      config.skills.paths = config.skills.paths || []
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir)
      }
      config.command = config.command || {}
      for (const skill of skills) {
        if (skill.suppressed || skill.name in config.command) continue
        const command = {
          template: `Load and execute the \`${skill.name}\` skill.\n\n$ARGUMENTS`,
        }
        if (skill.description) command.description = skill.description
        config.command[skill.name] = command
      }
    },
  })
}
