export abstract class Neighbor {
  abstract get address (): string

  get gatewayCanSendTo (): boolean {
    return true
  }

  get gatewayCanReceiveFrom (): boolean {
    return true
  }

  match (address: string): boolean {
    return this.address === address
  }
}
