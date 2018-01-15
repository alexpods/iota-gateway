export abstract class Neighbor {
  abstract get address(): string

  get gatewayCanSend(): boolean {
    return true
  }

  get gatewayCanReceive(): boolean {
    return true
  }

  match(address: string): boolean {
    return this.address === address
  }
}
