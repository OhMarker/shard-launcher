import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FriendsView } from '@shared/types'
import { errorMessage, invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'

/** Friends' in-game status changes on its own; poll while the page is open. */
const POLL_MS = 30_000

export function useFriendsView(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => invoke('friends:list'),
    enabled,
    staleTime: 10_000,
    refetchInterval: POLL_MS
  })
}

/** Every friends call returns the full view, so each mutation just replaces the cache. */
export function useFriendsMutations() {
  const qc = useQueryClient()
  const apply = (view: FriendsView): void => {
    qc.setQueryData(queryKeys.friends, view)
  }
  const fail = (title: string) => (err: unknown) => toast({ kind: 'error', title, message: errorMessage(err) })

  const request = useMutation({
    mutationFn: (name: string) => invoke('friends:request', { name }),
    onSuccess: (view, name) => {
      apply(view)
      const isFriend = view.friends.some((f) => f.name.toLowerCase() === name.toLowerCase())
      toast({
        kind: 'success',
        title: isFriend ? `You and ${name} are friends` : `Friend request sent to ${name}`,
        message: isFriend ? null : 'They will see it the next time they open Shard.'
      })
    },
    onError: fail('Could not send the request')
  })

  const accept = useMutation({
    mutationFn: (uuid: string) => invoke('friends:accept', { uuid }),
    onSuccess: apply,
    onError: fail('Could not accept the request')
  })

  const decline = useMutation({
    mutationFn: (uuid: string) => invoke('friends:decline', { uuid }),
    onSuccess: apply,
    onError: fail('Could not update the request')
  })

  const remove = useMutation({
    mutationFn: (uuid: string) => invoke('friends:remove', { uuid }),
    onSuccess: apply,
    onError: fail('Could not remove the friend')
  })

  return { request, accept, decline, remove }
}
