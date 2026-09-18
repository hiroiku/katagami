import { type ContainerPolicy, createContainer, createMetadataKey, createScope, entrypoint } from 'katagami';

const EXPOSURE = createMetadataKey<'internal' | 'public'>()('exposure');
const policy = {
	name: 'reports',
	requiredMetadata: [EXPOSURE] as const,
	beforeReturn({ registrations }) {
		if (registrations.some(registration => registration.metadata.require(EXPOSURE) === 'internal')) {
			throw new Error('Internal dependencies cannot be returned.');
		}
	},
} satisfies ContainerPolicy;

function createReports(options: { policy: typeof policy }) {
	return createContainer({ policy: options.policy })
		.registerSingleton('repository', () => ({ read: (id: string) => `report:${id}` }), {
			metadata: [EXPOSURE('internal')],
		})
		.registerScoped(
			'readReport',
			entrypoint(resolver => {
				const repository = resolver.resolve('repository');
				return (id: string) => ({ id, title: repository.read(id) });
			}),
			{ metadata: [EXPOSURE('public')] },
		);
}

const container = createContainer({ policy }).use(createReports({ policy }));
await using operations = createScope(container, { access: 'operations' });
const readReport = operations.get('readReport');
console.log(await readReport('42'));
