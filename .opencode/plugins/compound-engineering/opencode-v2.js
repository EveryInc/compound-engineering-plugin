function v2SkillInfo(skill, slash) {
  return {
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    slash,
    location: skill.skillPath,
    content: skill.body,
  }
}

function v2Skill(skill, slash) {
  return {
    id: skill.name,
    ...v2SkillInfo(skill, slash),
  }
}

export function createV2Setup(skills) {
  return async function setupV2(context) {
    let commandsRegistered = false
    const commandTransform = context?.command?.transform
    const prompt = context?.session?.prompt

    if (typeof commandTransform === "function" && typeof prompt === "function") {
      await commandTransform((draft) => {
        if (typeof draft?.add !== "function") return
        commandsRegistered = true
        for (const skill of skills) {
          if (skill.suppressed) continue
          draft.add({
            name: skill.name,
            description: skill.description,
            execute: async (input) => {
              const promptInput = input?.prompt ?? {}
              const attachedSkills = promptInput.skills ?? []
              const skillAlreadyAttached = attachedSkills.some((attached) => attached.id === skill.name)
              await prompt({
                ...promptInput,
                sessionID: input.sessionID,
                text: promptInput.text || "",
                skills: skillAlreadyAttached ? attachedSkills : [...attachedSkills, { id: skill.name }],
                delivery: input.delivery,
              })
            },
          })
        }
      })
    }

    const skillTransform = context?.skill?.transform
    if (typeof skillTransform !== "function") return

    await skillTransform((draft) => {
      if (typeof draft?.add !== "function") return
      for (const skill of skills) {
        draft.add(v2Skill(skill, commandsRegistered ? false : !skill.suppressed))
      }
    })
  }
}
