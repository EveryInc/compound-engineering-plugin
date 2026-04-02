export type PiSharedResourceContract = {
  state: "active" | "preserved-untrusted" | "absent"
  retain: boolean
  advertise: boolean
}

export function derivePiSharedResourceContract(options: {
  nextOwns?: boolean
  otherVerifiedOwner?: boolean
  preserveUntrusted?: boolean
}): PiSharedResourceContract {
  if (options.nextOwns || options.otherVerifiedOwner) {
    return {
      state: "active",
      retain: true,
      advertise: true,
    }
  }

  if (options.preserveUntrusted) {
    return {
      state: "preserved-untrusted",
      retain: false,
      advertise: false,
    }
  }

  return {
    state: "absent",
    retain: false,
    advertise: false,
  }
}
