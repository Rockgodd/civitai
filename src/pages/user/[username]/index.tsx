import {
  ActionIcon,
  AspectRatio,
  Box,
  Card,
  Center,
  Container,
  createStyles,
  Group,
  Loader,
  Menu,
  Rating,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';
import {
  IconArrowBackUp,
  IconBan,
  IconDotsVertical,
  IconDownload,
  IconHeart,
  IconMicrophone,
  IconMicrophoneOff,
  IconStar,
  IconTrash,
  IconUpload,
  IconUsers,
} from '@tabler/icons';
import { InferGetServerSidePropsType } from 'next/types';

import { DomainIcon } from '~/components/DomainIcon/DomainIcon';
import { getEdgeUrl } from '~/client-utils/cf-images-utils';
import { EdgeImage } from '~/components/EdgeImage/EdgeImage';
import { FollowUserButton } from '~/components/FollowUserButton/FollowUserButton';
import { IconBadge } from '~/components/IconBadge/IconBadge';
import { RankBadge } from '~/components/Leaderboard/RankBadge';
import { Meta } from '~/components/Meta/Meta';
import { Username } from '~/components/User/Username';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { createServerSideProps } from '~/server/utils/server-side-helpers';
import { sortDomainLinks } from '~/utils/domain-link';
import { showErrorNotification } from '~/utils/notifications';
import { NotFound } from '~/components/AppLayout/NotFound';
import { abbreviateNumber } from '~/utils/number-helpers';
import { trpc } from '~/utils/trpc';
import { invalidateModeratedContent } from '~/utils/query-invalidation-utils';
import { removeEmpty } from '~/utils/object-helpers';
import { userPageQuerySchema } from '~/server/schema/user.schema';
import { useRouter } from 'next/router';
import { AppLayout } from '~/components/AppLayout/AppLayout';
import { UserImagesFeed } from '~/components/User/UserImagesFeed';

export const getServerSideProps = createServerSideProps({
  useSSG: true,
  resolver: async ({ ssg, ctx }) => {
    const { username, id } = userPageQuerySchema.parse(ctx.params);
    if (id || username) await ssg?.user.getCreator.prefetch({ username });

    return {
      props: removeEmpty({
        id,
        username,
      }),
    };
  },
});

function UserPage({ username }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <Tabs.Panel value="/images">
      <UserImagesFeed username={username} />
    </Tabs.Panel>
  );
}

function NestedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { username } = router.query as { username?: string };
  const currentUser = useCurrentUser();
  const { classes, theme } = useStyles();
  const queryUtils = trpc.useContext();

  const { data: user, isLoading: userLoading } = trpc.user.getCreator.useQuery({ username });

  const { models: uploads } = user?._count ?? { models: 0 };
  const stats = user?.stats;
  const isMod = currentUser && currentUser.isModerator;
  const isSameUser = currentUser?.username === user?.username;

  const removeContentMutation = trpc.user.removeAllContent.useMutation({
    onSuccess() {
      invalidateModeratedContent(queryUtils);
    },
  });
  const toggleMuteMutation = trpc.user.toggleMute.useMutation({
    async onMutate() {
      await queryUtils.user.getCreator.cancel({ username });

      const prevUser = queryUtils.user.getCreator.getData({ username });
      queryUtils.user.getCreator.setData({ username }, () =>
        prevUser
          ? {
              ...prevUser,
              muted: !prevUser.muted,
            }
          : undefined
      );

      return { prevUser };
    },
    onError(_error, _vars, context) {
      queryUtils.user.getCreator.setData({ username }, context?.prevUser);
      showErrorNotification({
        error: new Error('Unable to mute user, please try again.'),
      });
    },
  });
  const handleToggleMute = () => {
    if (user) toggleMuteMutation.mutate({ id: user.id });
  };
  const toggleBanMutation = trpc.user.toggleBan.useMutation({
    async onMutate() {
      await queryUtils.user.getCreator.cancel({ username });

      const prevUser = queryUtils.user.getCreator.getData({ username });
      queryUtils.user.getCreator.setData({ username }, () =>
        prevUser
          ? {
              ...prevUser,
              bannedAt: prevUser.bannedAt ? null : new Date(),
            }
          : undefined
      );

      return { prevUser };
    },
    onError(_error, _vars, context) {
      queryUtils.user.getCreator.setData({ username }, context?.prevUser);
      showErrorNotification({
        error: new Error('Unable to ban user, please try again.'),
      });
    },
  });
  const handleToggleBan = () => {
    if (user) {
      if (user.bannedAt) toggleBanMutation.mutate({ id: user.id });
      else
        openConfirmModal({
          title: 'Ban User',
          children: `Are you sure you want to ban this user? Once a user is banned, they won't be able to access the app again.`,
          labels: { confirm: 'Yes, ban the user', cancel: 'Cancel' },
          confirmProps: { color: 'red' },
          onConfirm: () => toggleBanMutation.mutate({ id: user.id }),
        });
    }
  };
  const handleRemoveContent = () => {
    if (!user) return;
    openConfirmModal({
      title: 'Remove All Content',
      children: `Are you sure you want to remove all content (models, reviews, comments, posts, and images) by this user? This action cannot be undone.`,
      labels: { confirm: 'Yes, remove all content', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => removeContentMutation.mutate({ id: user.id }),
    });
  };

  if (userLoading && !user)
    return (
      <Container>
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  if (!userLoading && !user) return <NotFound />;

  const activeTab = router.pathname.split('/[username]').pop()?.split('?').at(0) || '/images';

  return (
    <>
      {user && stats ? (
        <Meta
          title={`${user.username} Creator Profile | Civitai`}
          description={`Average Rating: ${stats.ratingAllTime.toFixed(1)} (${abbreviateNumber(
            stats.ratingCountAllTime
          )}), Models Uploaded: ${abbreviateNumber(uploads)}, Followers: ${abbreviateNumber(
            stats.followerCountAllTime
          )}, Total Likes Received: ${abbreviateNumber(
            stats.favoriteCountAllTime
          )}, Total Downloads Received: ${abbreviateNumber(stats.downloadCountAllTime)}. `}
          image={!user.image ? undefined : getEdgeUrl(user.image, { width: 1200 })}
        />
      ) : (
        <Meta
          title={`Creator Profile | Civitai`}
          description="Learn more about this awesome creator on Civitai."
        />
      )}
      <Tabs
        variant="outline"
        value={activeTab}
        onTabChange={(value) => router.push(`/user/${username}${value}`)}
      >
        {user && (
          <>
            <Box className={classes.banner} mb="md">
              <Container size="xl">
                <Stack className={classes.wrapper}>
                  {user.image && (
                    <div className={classes.outsideImage}>
                      <AspectRatio ratio={1 / 1} className={classes.image}>
                        <EdgeImage
                          src={user.image}
                          name={user.username}
                          width={128}
                          alt={user.username ?? ''}
                        />
                      </AspectRatio>
                    </div>
                  )}
                  <Card radius="sm" className={classes.card}>
                    <Group noWrap>
                      {user.image && (
                        <div className={classes.insideImage}>
                          <AspectRatio ratio={1 / 1} className={classes.image}>
                            <EdgeImage
                              src={user.image}
                              name={user.username}
                              width={128}
                              alt={user.username ?? ''}
                            />
                          </AspectRatio>
                        </div>
                      )}
                      <Stack spacing="xs">
                        <Group position="apart">
                          <Title order={2}>
                            <Username {...user} inherit />
                          </Title>
                          <Group spacing={4} noWrap>
                            <FollowUserButton userId={user.id} size="md" compact />

                            {isMod && (
                              <Menu position="left" withinPortal>
                                <Menu.Target>
                                  <ActionIcon loading={removeContentMutation.isLoading}>
                                    <IconDotsVertical />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item
                                    color={user.bannedAt ? 'green' : 'red'}
                                    icon={
                                      !user.bannedAt ? (
                                        <IconBan size={14} stroke={1.5} />
                                      ) : (
                                        <IconArrowBackUp size={14} stroke={1.5} />
                                      )
                                    }
                                    onClick={handleToggleBan}
                                  >
                                    {user.bannedAt ? 'Restore user' : 'Ban user'}
                                  </Menu.Item>
                                  <Menu.Item
                                    icon={
                                      user.muted ? (
                                        <IconMicrophone size={14} stroke={1.5} />
                                      ) : (
                                        <IconMicrophoneOff size={14} stroke={1.5} />
                                      )
                                    }
                                    onClick={handleToggleMute}
                                  >
                                    {user.muted ? 'Unmute user' : 'Mute user'}
                                  </Menu.Item>
                                  <Menu.Item
                                    color="red"
                                    icon={<IconTrash size={14} stroke={1.5} />}
                                    onClick={handleRemoveContent}
                                  >
                                    Remove all content
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            )}
                          </Group>
                        </Group>
                        <Group spacing="xs">
                          <RankBadge rank={user.rank?.leaderboardRank} size="lg" />
                          {stats && (
                            <>
                              <IconBadge
                                tooltip="Average Rating"
                                sx={{ userSelect: 'none' }}
                                size="lg"
                                icon={
                                  <Rating
                                    size="sm"
                                    value={stats.ratingAllTime}
                                    readOnly
                                    emptySymbol={
                                      theme.colorScheme === 'dark' ? (
                                        <IconStar
                                          size={18}
                                          fill="rgba(255,255,255,.3)"
                                          color="transparent"
                                        />
                                      ) : undefined
                                    }
                                  />
                                }
                                variant={
                                  theme.colorScheme === 'dark' && stats.ratingCountAllTime > 0
                                    ? 'filled'
                                    : 'light'
                                }
                              >
                                <Text
                                  size="sm"
                                  color={stats.ratingCountAllTime > 0 ? undefined : 'dimmed'}
                                >
                                  {abbreviateNumber(stats.ratingCountAllTime)}
                                </Text>
                              </IconBadge>
                              <IconBadge
                                tooltip="Uploads"
                                icon={<IconUpload size={16} />}
                                color="gray"
                                size="lg"
                                variant={theme.colorScheme === 'dark' ? 'filled' : 'light'}
                              >
                                <Text size="sm">{abbreviateNumber(uploads)}</Text>
                              </IconBadge>
                              <IconBadge
                                tooltip="Followers"
                                icon={<IconUsers size={16} />}
                                href={`/user/${user.username}/followers`}
                                color="gray"
                                size="lg"
                                variant={theme.colorScheme === 'dark' ? 'filled' : 'light'}
                              >
                                <Text size="sm">
                                  {abbreviateNumber(stats.followerCountAllTime)}
                                </Text>
                              </IconBadge>
                              <IconBadge
                                tooltip="Favorites"
                                icon={<IconHeart size={16} />}
                                color="gray"
                                variant={theme.colorScheme === 'dark' ? 'filled' : 'light'}
                                size="lg"
                              >
                                <Text size="sm">
                                  {abbreviateNumber(stats.favoriteCountAllTime)}
                                </Text>
                              </IconBadge>
                              <IconBadge
                                tooltip="Downloads"
                                icon={<IconDownload size={16} />}
                                variant={theme.colorScheme === 'dark' ? 'filled' : 'light'}
                                size="lg"
                              >
                                <Text size="sm">
                                  {abbreviateNumber(stats.downloadCountAllTime)}
                                </Text>
                              </IconBadge>
                            </>
                          )}
                        </Group>
                        {!!user.links?.length && (
                          <Group spacing={0}>
                            {sortDomainLinks(user.links).map((link, index) => (
                              <ActionIcon
                                key={index}
                                component="a"
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="md"
                              >
                                <DomainIcon domain={link.domain} size={22} />
                              </ActionIcon>
                            ))}
                          </Group>
                        )}
                      </Stack>
                    </Group>
                  </Card>
                </Stack>
                <Tabs.List className={classes.tabList}>
                  <Tabs.Tab value="/images">Images</Tabs.Tab>
                  <Tabs.Tab value="/posts">Posts</Tabs.Tab>
                  <Tabs.Tab value="/models">Published models</Tabs.Tab>
                  {isSameUser && <Tabs.Tab value="/drafts">Draft models</Tabs.Tab>}
                </Tabs.List>
              </Container>
            </Box>
            {children}
          </>
        )}
      </Tabs>
    </>
  );
}

const useStyles = createStyles((theme) => ({
  banner: {
    position: 'relative',
    marginTop: `-${theme.spacing.md}px`,
    paddingTop: theme.spacing.xl * 2,
    paddingBottom: theme.spacing.xl * 2,
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],

    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
  },
  image: {
    width: '128px',
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  wrapper: {
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,

    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      alignItems: 'center',
      marginBottom: theme.spacing.xs * 4, // 40px
    },
  },
  outsideImage: {
    display: 'none',
    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      display: 'block',
    },
  },
  insideImage: {
    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      display: 'none',
    },
  },
  card: {
    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      width: '100%',
    },
  },
  tabList: {
    position: 'absolute',
    bottom: 0,
    left: 'auto',
    right: 'auto',
    zIndex: 1,
  },
}));

export const UserProfileLayout = (page: React.ReactElement) => (
  <AppLayout>
    <NestedLayout>{page}</NestedLayout>
  </AppLayout>
);

UserPage.getLayout = UserProfileLayout;

export default UserPage;
